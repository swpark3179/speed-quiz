import { randomInt } from 'node:crypto';
import {
  AppError,
  RoomInput,
  RoomItem,
  RoomSettings,
  roomStatus,
  type ConfirmResult,
  type Phase,
  type QuestionKind,
  type RoomDetailDto,
  type RoomListItem,
} from '@sq/shared';
import type { z } from 'zod';
import type { Db } from '../db/driver';
import { newToken } from '../auth/tokens';
import type { RoomRegistry } from '../game/registry';
import { previewText } from '../game/projections';

interface RoomRow {
  id: number;
  title: string;
  phase: Phase;
  code: string | null;
  presenter_key: string | null;
  settings: string;
  draft_items: string;
  base_url: string | null;
  created_by: number | null;
  created_at: number;
  updated_at: number;
  confirmed_at: number | null;
  started_at: number | null;
  finished_at: number | null;
  created_by_name?: string | null;
}

export class RoomService {
  constructor(
    private readonly db: Db,
    private readonly registry: RoomRegistry,
  ) {}

  private row(id: number): RoomRow {
    const r = this.db.get<RoomRow>('SELECT * FROM rooms WHERE id = ?', id);
    if (!r) throw new AppError('NOT_FOUND');
    return r;
  }

  /** Rooms are private to the admin who created them; others get a plain 404. */
  assertOwned(id: number, adminId: number): void {
    if (!this.isOwner(id, adminId)) throw new AppError('NOT_FOUND');
  }

  isOwner(id: number, adminId: number): boolean {
    const r = this.db.get<{ created_by: number | null }>('SELECT created_by FROM rooms WHERE id = ?', id);
    return !!r && r.created_by === adminId;
  }

  /** A question may be used by a room's owner when it is theirs or public. */
  private questionUsable(questionId: number, ownerId: number | null): boolean {
    return !!this.db.get(
      'SELECT 1 FROM questions WHERE id = ? AND deleted_at IS NULL AND (is_public = 1 OR (created_by IS NOT NULL AND created_by = ?))',
      questionId,
      ownerId ?? -1,
    );
  }

  private assertItemsUsable(items: { questionId: number }[], ownerId: number): void {
    items.forEach((it, i) => {
      if (!this.questionUsable(it.questionId, ownerId)) {
        throw new AppError('ROOM_INVALID', `${i + 1}번째 문제를 사용할 수 없어요. 삭제되었거나 비공개 문제예요.`);
      }
    });
  }

  list(adminId: number): RoomListItem[] {
    const rows = this.db.all<
      RoomRow & { question_count: number; participant_count: number }
    >(
      `SELECT r.*, a.display_name AS created_by_name,
         (SELECT COUNT(*) FROM participants p WHERE p.room_id = r.id AND p.kicked_at IS NULL) AS participant_count,
         CASE WHEN r.phase = 'DRAFT' THEN json_array_length(r.draft_items)
              ELSE (SELECT COUNT(*) FROM room_questions q WHERE q.room_id = r.id) END AS question_count
       FROM rooms r LEFT JOIN admins a ON a.id = r.created_by
       WHERE r.created_by = ?
       ORDER BY CASE WHEN r.phase IN ('DRAFT','ENDED') THEN 1 ELSE 0 END, r.updated_at DESC`,
      adminId,
    );
    return rows.map((r) => {
      const settings = RoomSettings.parse(JSON.parse(r.settings));
      return {
        id: r.id,
        title: r.title,
        phase: r.phase,
        status: roomStatus(r.phase),
        code: r.code,
        questionCount: r.question_count,
        participantCount: r.participant_count,
        prizeCount: settings.prizeCount,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        createdByName: r.created_by_name ?? null,
      };
    });
  }

  get(id: number): RoomDetailDto {
    const r = this.row(id);
    const settings = RoomSettings.parse(JSON.parse(r.settings));
    let items: RoomDetailDto['items'];
    if (r.phase === 'DRAFT') {
      const draft = (JSON.parse(r.draft_items) as unknown[]).map((x) => RoomItem.parse(x));
      items = draft.map((it) => {
        const q = this.db.get<{ id: number; kind: QuestionKind; title: string; body: string; time_limit_sec: number | null; n: number }>(
          `SELECT q.id, q.kind, q.title, q.body, q.time_limit_sec, (SELECT COUNT(*) FROM choices c WHERE c.question_id = q.id) AS n
           FROM questions q WHERE q.id = ? AND q.deleted_at IS NULL AND (q.is_public = 1 OR (q.created_by IS NOT NULL AND q.created_by = ?))`,
          it.questionId,
          r.created_by ?? -1,
        );
        return {
          ...it,
          question: q
            ? { id: q.id, kind: q.kind, title: q.title, preview: previewText(q.kind, q.body), choiceCount: q.n, timeLimitSec: q.time_limit_sec }
            : null,
        };
      });
    } else {
      const rqs = this.db.all<{
        source_question_id: number | null;
        kind: QuestionKind;
        title: string;
        body: string;
        time_limit_ms: number;
        points_multiplier: number;
        n: number;
      }>(
        `SELECT q.*, (SELECT COUNT(*) FROM room_question_choices c WHERE c.room_question_id = q.id) AS n
         FROM room_questions q WHERE q.room_id = ? ORDER BY q.position`,
        id,
      );
      items = rqs.map((q) => ({
        questionId: q.source_question_id ?? 0,
        timeLimitSec: Math.round(q.time_limit_ms / 1000),
        multiplier: q.points_multiplier,
        question: {
          id: q.source_question_id ?? 0,
          kind: q.kind,
          title: q.title,
          preview: previewText(q.kind, q.body),
          choiceCount: q.n,
          timeLimitSec: Math.round(q.time_limit_ms / 1000),
        },
      }));
    }
    const participantCount = this.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM participants WHERE room_id = ? AND kicked_at IS NULL',
      id,
    )!.n;
    const base = r.base_url ?? '';
    return {
      id: r.id,
      title: r.title,
      phase: r.phase,
      status: roomStatus(r.phase),
      code: r.code,
      settings,
      items,
      joinUrl: r.code ? `${base}/join/${r.code}` : null,
      presenterUrl: r.presenter_key ? `${base}/screen/${r.id}#key=${r.presenter_key}` : null,
      participantCount,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      confirmedAt: r.confirmed_at,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    };
  }

  create(input: z.output<typeof RoomInput>, adminId: number): RoomDetailDto {
    this.assertItemsUsable(input.items, adminId);
    const now = Date.now();
    const id = this.db.run(
      'INSERT INTO rooms (title, settings, draft_items, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      input.title,
      JSON.stringify(input.settings),
      JSON.stringify(input.items),
      adminId,
      now,
      now,
    ).lastInsertRowid;
    return this.get(id);
  }

  update(id: number, input: z.output<typeof RoomInput>): RoomDetailDto {
    const r = this.row(id);
    if (r.phase !== 'DRAFT') throw new AppError('ROOM_NOT_DRAFT');
    if (r.created_by !== null) this.assertItemsUsable(input.items, r.created_by);
    this.db.run(
      'UPDATE rooms SET title = ?, settings = ?, draft_items = ?, updated_at = ? WHERE id = ?',
      input.title,
      JSON.stringify(input.settings),
      JSON.stringify(input.items),
      Date.now(),
      id,
    );
    return this.get(id);
  }

  remove(id: number): void {
    const r = this.row(id);
    if (r.phase !== 'DRAFT' && r.phase !== 'ENDED') throw new AppError('ROOM_LIVE');
    this.registry.dispose(id);
    this.db.run('DELETE FROM rooms WHERE id = ?', id);
  }

  private generateCode(): string {
    for (let i = 0; i < 50; i++) {
      const code = String(randomInt(100000, 1000000));
      const taken = this.db.get(
        "SELECT 1 FROM rooms WHERE code = ? AND phase NOT IN ('DRAFT','ENDED')",
        code,
      );
      if (!taken) return code;
    }
    throw new AppError('INTERNAL');
  }

  confirm(id: number, baseUrl: string): ConfirmResult {
    const r = this.row(id);
    if (r.phase !== 'DRAFT') throw new AppError('ROOM_NOT_DRAFT');
    const settings = RoomSettings.parse(JSON.parse(r.settings));
    const items = (JSON.parse(r.draft_items) as unknown[]).map((x) => RoomItem.parse(x));
    if (items.length === 0) throw new AppError('ROOM_EMPTY');
    const code = this.generateCode();
    const key = newToken(16);
    const now = Date.now();
    this.db.tx(() => {
      this.db.run('DELETE FROM room_questions WHERE room_id = ?', id);
      items.forEach((it, pos) => {
        const q = this.db.get<{
          id: number;
          kind: QuestionKind;
          title: string;
          body: string;
          image_url: string | null;
          explanation: string | null;
          time_limit_sec: number | null;
          version: number;
        }>(
          'SELECT * FROM questions WHERE id = ? AND deleted_at IS NULL AND (is_public = 1 OR (created_by IS NOT NULL AND created_by = ?))',
          it.questionId,
          r.created_by ?? -1,
        );
        if (!q) throw new AppError('ROOM_INVALID', `${pos + 1}번째 문제를 사용할 수 없어요(삭제 또는 비공개 전환). 목록에서 빼 주세요.`);
        const choices = this.db.all<{ text: string; is_correct: number }>(
          'SELECT text, is_correct FROM choices WHERE question_id = ? ORDER BY position',
          q.id,
        );
        const correct = choices.filter((c) => c.is_correct).length;
        if (choices.length < 2 || choices.length > 6 || correct !== 1) {
          throw new AppError('ROOM_INVALID', `${pos + 1}번째 문제의 보기 구성이 올바르지 않아요.`);
        }
        const limitSec = it.timeLimitSec ?? q.time_limit_sec ?? settings.defaultTimeLimitSec;
        const rqId = this.db.run(
          `INSERT INTO room_questions (room_id, position, source_question_id, source_version, kind, title, body, image_url, explanation, time_limit_ms, points_multiplier)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          pos,
          q.id,
          q.version,
          q.kind,
          q.title,
          q.body,
          q.image_url,
          q.explanation,
          limitSec * 1000,
          it.multiplier,
        ).lastInsertRowid;
        choices.forEach((c, i) => {
          this.db.run(
            'INSERT INTO room_question_choices (room_question_id, position, text, is_correct) VALUES (?, ?, ?, ?)',
            rqId,
            i,
            c.text,
            c.is_correct,
          );
        });
      });
      this.db.run(
        `UPDATE rooms SET phase = 'LOBBY', code = ?, presenter_key = ?, base_url = ?, confirmed_at = ?, updated_at = ?,
           current_index = -1, prizes_revealed = 0, state_version = state_version + 1 WHERE id = ?`,
        code,
        key,
        baseUrl,
        now,
        now,
        id,
      );
    });
    this.registry.dispose(id);
    this.registry.get(id);
    return { code, joinUrl: `${baseUrl}/join/${code}`, presenterUrl: `${baseUrl}/screen/${id}#key=${key}` };
  }

  unconfirm(id: number): RoomDetailDto {
    const r = this.row(id);
    if (r.phase !== 'LOBBY') throw new AppError('INVALID_TRANSITION', '대기실 단계에서만 확정을 취소할 수 있어요.');
    this.registry.peek(id)?.evictPlayers();
    this.registry.dispose(id);
    this.db.tx(() => {
      this.db.run('DELETE FROM participants WHERE room_id = ?', id);
      this.db.run('DELETE FROM room_questions WHERE room_id = ?', id);
      this.db.run(
        "UPDATE rooms SET phase = 'DRAFT', code = NULL, presenter_key = NULL, confirmed_at = NULL, state_version = state_version + 1, updated_at = ? WHERE id = ?",
        Date.now(),
        id,
      );
    });
    return this.get(id);
  }

  clone(id: number, adminId: number): RoomDetailDto {
    const r = this.row(id);
    let items: z.output<typeof RoomItem>[];
    if (r.phase === 'DRAFT') {
      items = (JSON.parse(r.draft_items) as unknown[]).map((x) => RoomItem.parse(x));
    } else {
      items = this.db
        .all<{ source_question_id: number | null; time_limit_ms: number; points_multiplier: number }>(
          'SELECT source_question_id, time_limit_ms, points_multiplier FROM room_questions WHERE room_id = ? ORDER BY position',
          id,
        )
        .filter((q) => q.source_question_id !== null)
        .map((q) => ({ questionId: q.source_question_id!, timeLimitSec: null, multiplier: q.points_multiplier }));
    }
    return this.create(
      { title: `${r.title} (복사본)`.slice(0, 60), settings: RoomSettings.parse(JSON.parse(r.settings)), items },
      adminId,
    );
  }

  rotatePresenterKey(id: number): { presenterUrl: string } {
    const r = this.row(id);
    if (r.phase === 'DRAFT') throw new AppError('INVALID_TRANSITION');
    const key = newToken(16);
    this.db.run('UPDATE rooms SET presenter_key = ? WHERE id = ?', key, id);
    const engine = this.registry.peek(id);
    if (engine) engine.presenterKey = key;
    return { presenterUrl: `${r.base_url ?? ''}/screen/${id}#key=${key}` };
  }
}
