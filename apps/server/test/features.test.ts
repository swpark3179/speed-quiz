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

describe('migration 3', () => {
  it('adds question groups to a v2 database in place', () => {
    const db = new Db(':memory:');
    // Minimal v2-shaped tables with data, to check the in-place upgrade.
    db.exec(`
      CREATE TABLE admins (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_login_at INTEGER,
        role TEXT NOT NULL DEFAULT 'ADMIN') STRICT;
      CREATE TABLE questions (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
        image_url TEXT, time_limit_sec INTEGER, explanation TEXT, tags TEXT NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER, updated_by INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
        is_public INTEGER NOT NULL DEFAULT 0) STRICT;
      INSERT INTO admins (username, display_name, password_hash, created_at, role) VALUES ('a','a','x',0,'MAIN');
      INSERT INTO questions (kind, body, created_by, created_at, updated_at, is_public) VALUES ('TEXT','q',1,0,0,1);
      PRAGMA user_version = 2;
    `);
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')!.user_version).toBe(3);
    expect(db.get<{ group_id: number | null; is_public: number }>('SELECT group_id, is_public FROM questions')).toEqual({ group_id: null, is_public: 1 });
    const gid = db.run("INSERT INTO question_groups (name, created_by, created_at, updated_at) VALUES ('g', 1, 0, 0)").lastInsertRowid;
    db.run('UPDATE questions SET group_id = ?, group_position = 0', gid);
    db.run('DELETE FROM question_groups WHERE id = ?', gid);
    // ON DELETE SET NULL keeps the question
    expect(db.get<{ group_id: number | null }>('SELECT group_id FROM questions')!.group_id).toBeNull();
  });
});

describe('question groups', () => {
  const list = (w: ReturnType<typeof setupWorld>, viewer: number, extra: Record<string, unknown> = {}) =>
    w.questions.list(viewer, { page: 1, pageSize: 50, ...extra }).items.map((i) => i.id);

  it('groups my questions in order and keeps them out of the ungrouped list', () => {
    const w = setupWorld();
    const [a, b, c, d] = [1, 2, 3, 4].map((n) => w.questions.create(input({ title: `문제 ${n}` }), w.adminId));
    const g = w.questions.createGroup({ name: '수도 퀴즈' }, w.adminId);
    expect(g).toMatchObject({ name: '수도 퀴즈', questionCount: 0, mine: true });
    expect(() => w.questions.createGroup({ name: '수도 퀴즈' }, w.adminId)).toThrow(/같은 이름/);

    expect(w.questions.moveQuestions([c!.id, a!.id, c!.id], g.id, w.adminId)).toEqual({ moved: 2 });
    expect(list(w, w.adminId, { groupId: g.id })).toEqual([c!.id, a!.id]);
    expect(list(w, w.adminId, { ungrouped: true }).sort()).toEqual([b!.id, d!.id].sort());
    expect(w.questions.get(a!.id, w.adminId)).toMatchObject({ groupId: g.id, groupName: '수도 퀴즈' });

    // created straight into the group → appended at the end
    const e = w.questions.create(input({ groupId: g.id }), w.adminId);
    expect(list(w, w.adminId, { groupId: g.id })).toEqual([c!.id, a!.id, e.id]);
    // duplicating my grouped question keeps the copy in the group
    const copy = w.questions.duplicate(c!.id, w.adminId);
    expect(copy.groupId).toBe(g.id);
    expect(list(w, w.adminId, { groupId: g.id })).toEqual([c!.id, a!.id, e.id, copy.id]);

    // reorder needs exactly the current members
    w.questions.reorderGroup(g.id, [copy.id, e.id, a!.id, c!.id], w.adminId);
    expect(list(w, w.adminId, { groupId: g.id })).toEqual([copy.id, e.id, a!.id, c!.id]);
    expect(() => w.questions.reorderGroup(g.id, [copy.id, e.id], w.adminId)).toThrow(/바뀌었어요/);
    expect(() => w.questions.reorderGroup(g.id, [copy.id, e.id, a!.id, b!.id], w.adminId)).toThrow(/바뀌었어요/);

    // updating the question without changing the group keeps its position
    w.questions.update(e.id, input({ groupId: g.id, body: '바뀐 문제' }), w.adminId);
    expect(list(w, w.adminId, { groupId: g.id })).toEqual([copy.id, e.id, a!.id, c!.id]);
    // taking it out via the editor / via move
    w.questions.update(e.id, input({ groupId: null }), w.adminId);
    w.questions.moveQuestions([a!.id], null, w.adminId);
    expect(list(w, w.adminId, { groupId: g.id })).toEqual([copy.id, c!.id]);
    expect(w.questions.listGroups(w.adminId)[0]).toMatchObject({ id: g.id, questionCount: 2, matchCount: 2, questionIds: [copy.id, c!.id] });

    // a deleted question no longer counts
    w.questions.remove(copy.id, w.adminId);
    expect(w.questions.getGroup(g.id, w.adminId).questionCount).toBe(1);
  });

  it('filters groups by their questions or their name', () => {
    const w = setupWorld();
    const g1 = w.questions.createGroup({ name: '역사' }, w.adminId);
    const g2 = w.questions.createGroup({ name: '과학' }, w.adminId);
    w.questions.createGroup({ name: '빈 그룹' }, w.adminId);
    w.questions.create(input({ groupId: g1.id, body: '세종대왕' }), w.adminId);
    w.questions.create(input({ groupId: g1.id, body: '이순신', kind: 'HTML' }), w.adminId);
    w.questions.create(input({ groupId: g2.id, body: '뉴턴' }), w.adminId);

    expect(w.questions.listGroups(w.adminId).map((g) => g.name).sort()).toEqual(['과학', '빈 그룹', '역사'].sort());
    const byBody = w.questions.listGroups(w.adminId, { q: '세종' });
    expect(byBody.map((g) => [g.name, g.matchCount, g.questionCount])).toEqual([['역사', 1, 2]]);
    // a group-name search matches all its questions
    expect(w.questions.listGroups(w.adminId, { q: '과학' }).map((g) => [g.name, g.matchCount])).toEqual([['과학', 1]]);
    expect(list(w, w.adminId, { groupId: g2.id, q: '과학' })).toHaveLength(1);
    expect(w.questions.listGroups(w.adminId, { kind: 'HTML' }).map((g) => g.name)).toEqual(['역사']);
  });

  it('shows other admins only groups with public questions, and only those questions', () => {
    const w = setupWorld();
    const other = addAdmin(w, 'other');
    const g = w.questions.createGroup({ name: '팀 퀴즈' }, w.adminId);
    const pub = w.questions.create(input({ groupId: g.id, isPublic: true }), w.adminId);
    const priv = w.questions.create(input({ groupId: g.id, isPublic: false }), w.adminId);
    const hidden = w.questions.createGroup({ name: '비밀' }, w.adminId);
    w.questions.create(input({ groupId: hidden.id }), w.adminId);

    expect(w.questions.listGroups(other)).toEqual([
      expect.objectContaining({ id: g.id, questionCount: 1, publicCount: 1, mine: false, ownerName: 'tester' }),
    ]);
    expect(list(w, other, { groupId: g.id })).toEqual([pub.id]);
    expect(w.questions.getGroup(g.id, other).questionIds).toEqual([pub.id]);
    expect(w.questions.getGroup(g.id, w.adminId).questionIds).toEqual([pub.id, priv.id]);
    expect(() => w.questions.getGroup(hidden.id, other)).toThrow(/찾을 수/);
    expect(w.questions.listGroups(other, { scope: 'mine' })).toEqual([]);
    expect(w.questions.listGroups(w.adminId, { scope: 'public' })).toEqual([]);

    // others cannot change my group or put things into it
    const mineQ = w.questions.create(input(), other);
    expect(() => w.questions.renameGroup(g.id, { name: 'x' }, other)).toThrow(/바꿀 수 없어요/);
    expect(() => w.questions.deleteGroup(g.id, other)).toThrow(/바꿀 수 없어요/);
    expect(() => w.questions.reorderGroup(g.id, [pub.id], other)).toThrow(/바꿀 수 없어요/);
    expect(() => w.questions.setGroupVisibility(g.id, true, other)).toThrow(/바꿀 수 없어요/);
    expect(() => w.questions.moveQuestions([mineQ.id], g.id, other)).toThrow(/바꿀 수 없어요/);
    expect(() => w.questions.create(input({ groupId: g.id }), other)).toThrow(/바꿀 수 없어요/);
    expect(() => w.questions.moveQuestions([pub.id], null, other)).toThrow(/그룹에 넣거나 뺄 수 없어요/);
    expect(() => w.questions.moveQuestions([priv.id], null, other)).toThrow(/찾을 수/);
    // a duplicate of someone else's grouped question lands ungrouped
    expect(w.questions.duplicate(pub.id, other).groupId).toBeNull();
    // the same group name is fine for another admin
    expect(w.questions.createGroup({ name: '팀 퀴즈' }, other).name).toBe('팀 퀴즈');

    // bulk visibility
    expect(w.questions.setGroupVisibility(g.id, true, w.adminId)).toEqual({ changed: 1 });
    expect(list(w, other, { groupId: g.id }).sort()).toEqual([pub.id, priv.id].sort());
    w.questions.setGroupVisibility(g.id, false, w.adminId);
    expect(w.questions.listGroups(other).map((x) => x.id)).not.toContain(g.id);
  });

  it('deletes a group, keeping or deleting its questions', () => {
    const w = setupWorld();
    const g1 = w.questions.createGroup({ name: 'a' }, w.adminId);
    const q1 = w.questions.create(input({ groupId: g1.id }), w.adminId);
    expect(w.questions.deleteGroup(g1.id, w.adminId)).toEqual({ deletedQuestions: 0 });
    expect(w.questions.get(q1.id, w.adminId).groupId).toBeNull();
    expect(w.questions.listGroups(w.adminId)).toEqual([]);

    const g2 = w.questions.createGroup({ name: 'b' }, w.adminId);
    const q2 = w.questions.create(input({ groupId: g2.id }), w.adminId);
    expect(w.questions.deleteGroup(g2.id, w.adminId, true)).toEqual({ deletedQuestions: 1 });
    expect(() => w.questions.get(q2.id, w.adminId)).toThrow(/찾을 수/);
    expect(list(w, w.adminId)).toEqual([q1.id]);
  });

  it('feeds a room: a group is just its questions, in group order', () => {
    const w = setupWorld();
    const g = w.questions.createGroup({ name: '방 그룹' }, w.adminId);
    const qs = [1, 2, 3].map(() => w.questions.create(input({ groupId: g.id }), w.adminId));
    w.questions.reorderGroup(g.id, [qs[2]!.id, qs[0]!.id, qs[1]!.id], w.adminId);
    const { room } = makeRoom(w, list(w, w.adminId, { groupId: g.id }));
    expect(w.rooms.get(room.id).items.map((i) => i.questionId)).toEqual([qs[2]!.id, qs[0]!.id, qs[1]!.id]);
  });
});
