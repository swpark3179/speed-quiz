import { describe, expect, it } from 'vitest';
import { QuestionInput as QuestionInputSchema, type RosterDelta } from '@sq/shared';
import { Db } from '../src/db/driver';
import { migrate } from '../src/db/migrations';
import { addAdmin, makeQuestion, makeRoom, setupWorld } from './helpers';

const input = (over: Record<string, unknown> = {}) =>
  QuestionInputSchema.parse({
    kind: 'TEXT',
    body: '문제',
    choices: [
      { text: 'a', isCorrect: true },
      { text: 'b', isCorrect: false },
    ],
    ...over,
  });

describe('migration 2', () => {
  it('upgrades a v1 database in place', () => {
    const db = new Db(':memory:');
    // Minimal v1-shaped tables with data, to check the in-place upgrade.
    db.exec(`
      CREATE TABLE admins (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_login_at INTEGER) STRICT;
      CREATE TABLE questions (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
        image_url TEXT, time_limit_sec INTEGER, explanation TEXT, tags TEXT NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER, updated_by INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER) STRICT;
      CREATE TABLE rooms (id INTEGER PRIMARY KEY, created_by INTEGER) STRICT;
      INSERT INTO admins (username, display_name, password_hash, created_at) VALUES ('a','a','x',0), ('b','b','x',0);
      INSERT INTO questions (kind, body, created_by, created_at, updated_at) VALUES ('TEXT','q',2,0,0);
      PRAGMA user_version = 1;
    `);
    migrate(db);
    expect(db.all<{ username: string; role: string }>('SELECT username, role FROM admins ORDER BY id')).toEqual([
      { username: 'a', role: 'MAIN' },
      { username: 'b', role: 'ADMIN' },
    ]);
    expect(db.get<{ is_public: number }>('SELECT is_public FROM questions')!.is_public).toBe(1);
  });
});

describe('question visibility', () => {
  it('hides private questions, shows public ones read-only, and lets others duplicate', () => {
    const w = setupWorld();
    const other = addAdmin(w, 'other');
    const priv = w.questions.create(input({ isPublic: false }), w.adminId);
    const pub = w.questions.create(input({ isPublic: true, tags: ['공개'] }), w.adminId);

    // owner sees both
    expect(w.questions.list(w.adminId, { page: 1, pageSize: 50 }).total).toBe(2);
    // other admin sees only the public one
    const seen = w.questions.list(other, { page: 1, pageSize: 50 });
    expect(seen.items.map((i) => i.id)).toEqual([pub.id]);
    expect(seen.items[0]).toMatchObject({ mine: false, isPublic: true });
    expect(w.questions.tags(other)).toEqual(['공개']);
    expect(() => w.questions.get(priv.id, other)).toThrow(/찾을 수/);
    expect(w.questions.get(pub.id, other).mine).toBe(false);

    // scopes
    expect(w.questions.list(w.adminId, { scope: 'mine', page: 1, pageSize: 50 }).total).toBe(2);
    expect(w.questions.list(w.adminId, { scope: 'public', page: 1, pageSize: 50 }).total).toBe(0);
    expect(w.questions.list(other, { scope: 'public', page: 1, pageSize: 50 }).total).toBe(1);
    expect(w.questions.list(other, { scope: 'mine', page: 1, pageSize: 50 }).total).toBe(0);

    // others cannot edit or delete a public question
    expect(() => w.questions.update(pub.id, input(), other)).toThrow(/수정할 수 없어요/);
    expect(() => w.questions.remove(pub.id, other)).toThrow(/수정할 수 없어요/);
    expect(() => w.questions.update(priv.id, input(), other)).toThrow(/찾을 수/);

    // but can duplicate it into their own private copy
    const copy = w.questions.duplicate(pub.id, other);
    expect(copy).toMatchObject({ mine: true, isPublic: false });
    expect(() => w.questions.get(copy.id, w.adminId)).toThrow(/찾을 수/);

    // owner can flip visibility
    const flipped = w.questions.update(pub.id, input({ isPublic: false }), w.adminId);
    expect(flipped.isPublic).toBe(false);
    expect(w.questions.list(other, { page: 1, pageSize: 50 }).total).toBe(1); // only other's own copy
  });
});

describe('room ownership', () => {
  it('lists only own rooms and refuses foreign questions', () => {
    const w = setupWorld();
    const other = addAdmin(w, 'other');
    const priv = makeQuestion(w, { isPublic: false });
    const pub = makeQuestion(w, { isPublic: true });
    const { room } = makeRoom(w, [priv.id, pub.id]);

    expect(w.rooms.list(w.adminId).map((r) => r.id)).toEqual([room.id]);
    expect(w.rooms.list(other)).toEqual([]);
    expect(w.rooms.isOwner(room.id, w.adminId)).toBe(true);
    expect(w.rooms.isOwner(room.id, other)).toBe(false);
    expect(() => w.rooms.assertOwned(room.id, other)).toThrow(/찾을 수/);

    const mk = (items: number[]) => ({
      title: 'x',
      settings: w.rooms.get(room.id).settings,
      items: items.map((questionId) => ({ questionId, timeLimitSec: null, multiplier: 1 })),
    });
    expect(() => w.rooms.create(mk([priv.id]), other)).toThrow(/사용할 수 없어요/);
    expect(w.rooms.create(mk([pub.id]), other).items).toHaveLength(1);

    // a public question turned private after being drafted can no longer be confirmed by someone else
    const draft = w.rooms.create(mk([pub.id]), other);
    w.questions.update(pub.id, QuestionInputSchema.parse({ ...pub, isPublic: false, choices: pub.choices }), w.adminId);
    expect(() => w.rooms.confirm(draft.id, 'http://x')).toThrow(/사용할 수 없어요/);
  });
});

describe('nickname change', () => {
  const deltas = (w: ReturnType<typeof setupWorld>) => w.bus.of('roster:delta', 'play').map((e) => e.payload as RosterDelta);

  it('renames in the lobby, rejects duplicates, and broadcasts a replace delta', () => {
    const w = setupWorld();
    const q = makeQuestion(w);
    const { engine } = makeRoom(w, [q.id]);
    const a = engine.join('하나');
    const b = engine.join('둘');
    w.scheduler.advance(1000);

    expect(engine.rename(a.participantId, '  새  이름 ')).toEqual({ nickname: '새 이름' });
    w.scheduler.advance(1000);
    const last = deltas(w).at(-1)!;
    expect(last.removed).toEqual([a.participantId]);
    expect(last.added).toEqual([{ id: a.participantId, nickname: '새 이름' }]);
    expect(engine.rosterEntries().find((r) => r.id === a.participantId)?.nickname).toBe('새 이름');
    expect(w.db.get<{ nickname: string }>('SELECT nickname FROM participants WHERE id = ?', a.participantId)!.nickname).toBe('새 이름');

    // duplicates (including visually-similar ones) are refused; own name is fine
    expect(() => engine.rename(b.participantId, '새이름')).toThrow(/이미 사용 중/);
    expect(() => engine.rename(b.participantId, 'x'.repeat(13))).toThrow(/1~12/);
    expect(engine.rename(a.participantId, '새 이름')).toEqual({ nickname: '새 이름' });
    // the old name is free again
    expect(engine.rename(b.participantId, '하나').nickname).toBe('하나');
  });

  it('is refused once the game has started', () => {
    const w = setupWorld();
    const q = makeQuestion(w);
    const { engine } = makeRoom(w, [q.id]);
    const a = engine.join('하나');
    engine.startQuestion(0);
    expect(() => engine.rename(a.participantId, '바꿈')).toThrow(/시작된 뒤/);
  });
});
