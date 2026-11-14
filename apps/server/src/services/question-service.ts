import {
  AppError,
  QuestionInput,
  htmlToText,
  type QuestionDto,
  type QuestionListItem,
  type QuestionKind,
} from '@sq/shared';
import type { z } from 'zod';
import type { Db } from '../db/driver';
import { sanitizeQuestionHtml } from '../security/sanitize';
import { previewText } from '../game/projections';

interface QuestionRow {
  id: number;
  kind: QuestionKind;
  title: string;
  body: string;
  image_url: string | null;
  time_limit_sec: number | null;
  explanation: string | null;
  tags: string;
  version: number;
  is_public: number;
  created_by: number | null;
  created_at: number;
  updated_at: number;
  updated_by_name?: string | null;
  owner_name?: string | null;
  choice_count?: number;
}

interface ChoiceRow {
  id: number;
  question_id: number;
  position: number;
  text: string;
  is_correct: number;
}

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export class QuestionService {
  constructor(private readonly db: Db) {}

  /** SQL predicate for "questions this admin may see": their own plus everyone's public ones. */
  private static VISIBLE = '(q.created_by = ? OR q.is_public = 1)';

  list(
    viewerId: number,
    query: { q?: string; kind?: QuestionKind; tag?: string; scope?: 'all' | 'mine' | 'public'; page: number; pageSize: number },
  ): {
    items: QuestionListItem[];
    total: number;
  } {
    const where = ['q.deleted_at IS NULL', QuestionService.VISIBLE];
    const params: (string | number)[] = [viewerId];
    if (query.scope === 'mine') where.push('q.created_by = ?');
    else if (query.scope === 'public') where.push('(q.created_by IS NULL OR q.created_by <> ?)');
    if (query.scope === 'mine' || query.scope === 'public') params.push(viewerId);
    if (query.q) {
      where.push("(q.title LIKE ? ESCAPE '\\' OR q.body LIKE ? ESCAPE '\\')");
      const like = `%${likeEscape(query.q)}%`;
      params.push(like, like);
    }
    if (query.kind) {
      where.push('q.kind = ?');
      params.push(query.kind);
    }
    if (query.tag) {
      where.push('EXISTS (SELECT 1 FROM json_each(q.tags) WHERE value = ?)');
      params.push(query.tag);
    }
    const w = where.join(' AND ');
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM questions q WHERE ${w}`, ...params)!.n;
    const rows = this.db.all<QuestionRow>(
      `SELECT q.*, o.display_name AS owner_name, (SELECT COUNT(*) FROM choices c WHERE c.question_id = q.id) AS choice_count
       FROM questions q LEFT JOIN admins o ON o.id = q.created_by
       WHERE ${w} ORDER BY q.updated_at DESC, q.id DESC LIMIT ? OFFSET ?`,
      ...params,
      query.pageSize,
      (query.page - 1) * query.pageSize,
    );
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        preview: previewText(r.kind, r.body, 120),
        choiceCount: r.choice_count ?? 0,
        timeLimitSec: r.time_limit_sec,
        tags: JSON.parse(r.tags) as string[],
        hasImage: !!r.image_url,
        isPublic: !!r.is_public,
        mine: r.created_by === viewerId,
        ownerName: r.owner_name ?? null,
        updatedAt: r.updated_at,
      })),
    };
  }

  tags(viewerId: number): string[] {
    return this.db
      .all<{ value: string }>(
        `SELECT DISTINCT j.value AS value FROM questions q, json_each(q.tags) j
         WHERE q.deleted_at IS NULL AND ${QuestionService.VISIBLE} ORDER BY j.value`,
        viewerId,
      )
      .map((r) => r.value);
  }

  /** True when `viewerId` may see (and use in a room) the question. */
  isVisible(id: number, viewerId: number): boolean {
    return !!this.db.get(
      `SELECT 1 FROM questions q WHERE q.id = ? AND q.deleted_at IS NULL AND ${QuestionService.VISIBLE}`,
      id,
      viewerId,
    );
  }

  get(id: number, viewerId: number): QuestionDto {
    const row = this.db.get<QuestionRow>(
      `SELECT q.*, a.display_name AS updated_by_name, o.display_name AS owner_name
       FROM questions q
       LEFT JOIN admins a ON a.id = q.updated_by
       LEFT JOIN admins o ON o.id = q.created_by
       WHERE q.id = ? AND q.deleted_at IS NULL AND ${QuestionService.VISIBLE}`,
      id,
      viewerId,
    );
    if (!row) throw new AppError('NOT_FOUND');
    const choices = this.db.all<ChoiceRow>('SELECT * FROM choices WHERE question_id = ? ORDER BY position', id);
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      imageUrl: row.image_url,
      timeLimitSec: row.time_limit_sec,
      explanation: row.explanation,
      tags: JSON.parse(row.tags) as string[],
      version: row.version,
      choices: choices.map((c) => ({ id: c.id, position: c.position, text: c.text, isCorrect: !!c.is_correct })),
      isPublic: !!row.is_public,
      mine: row.created_by === viewerId,
      ownerName: row.owner_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedByName: row.updated_by_name ?? null,
    };
  }

  /** Visible AND owned by the viewer; otherwise 404 (hidden) or 403 (someone else's public question). */
  private getOwned(id: number, viewerId: number): QuestionDto {
    const q = this.get(id, viewerId);
    if (!q.mine) throw new AppError('FORBIDDEN', '다른 관리자의 문제는 수정할 수 없어요. 복제해서 내 문제로 사용해 보세요.');
    return q;
  }

  private normalize(input: z.output<typeof QuestionInput>): z.output<typeof QuestionInput> {
    if (input.kind === 'HTML') {
      const body = sanitizeQuestionHtml(input.body);
      if (!htmlToText(body) && !/<img\s/i.test(body)) throw new AppError('QUESTION_INVALID', '문제 내용이 비어 있어요.');
      return { ...input, body };
    }
    return input;
  }

  create(raw: z.output<typeof QuestionInput>, adminId: number): QuestionDto {
    const input = this.normalize(raw);
    const now = Date.now();
    const id = this.db.tx(() => {
      const qid = this.db.run(
        `INSERT INTO questions (kind, title, body, image_url, time_limit_sec, explanation, tags, is_public, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.kind,
        input.title,
        input.body,
        input.imageUrl,
        input.timeLimitSec,
        input.explanation,
        JSON.stringify(input.tags),
        input.isPublic ? 1 : 0,
        adminId,
        adminId,
        now,
        now,
      ).lastInsertRowid;
      this.insertChoices(qid, input.choices);
      return qid;
    });
    return this.get(id, adminId);
  }

  update(id: number, raw: z.output<typeof QuestionInput>, adminId: number): QuestionDto {
    this.getOwned(id, adminId);
    const input = this.normalize(raw);
    this.db.tx(() => {
      this.db.run(
        `UPDATE questions SET kind = ?, title = ?, body = ?, image_url = ?, time_limit_sec = ?, explanation = ?, tags = ?, is_public = ?,
           version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?`,
        input.kind,
        input.title,
        input.body,
        input.imageUrl,
        input.timeLimitSec,
        input.explanation,
        JSON.stringify(input.tags),
        input.isPublic ? 1 : 0,
        adminId,
        Date.now(),
        id,
      );
      this.db.run('DELETE FROM choices WHERE question_id = ?', id);
      this.insertChoices(id, input.choices);
    });
    return this.get(id, adminId);
  }

  private insertChoices(qid: number, choices: { text: string; isCorrect: boolean }[]): void {
    choices.forEach((c, i) => {
      this.db.run('INSERT INTO choices (question_id, position, text, is_correct) VALUES (?, ?, ?, ?)', qid, i, c.text, c.isCorrect ? 1 : 0);
    });
  }

  remove(id: number, adminId: number): void {
    this.getOwned(id, adminId);
    this.db.run('UPDATE questions SET deleted_at = ? WHERE id = ?', Date.now(), id);
  }

  duplicate(id: number, adminId: number): QuestionDto {
    const q = this.get(id, adminId);
    return this.create(
      {
        kind: q.kind,
        title: q.title ? `${q.title} (복사본)`.slice(0, 100) : '',
        body: q.body,
        imageUrl: q.imageUrl,
        timeLimitSec: q.timeLimitSec,
        explanation: q.explanation,
        tags: q.tags,
        isPublic: false,
        choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
      },
      adminId,
    );
  }
}
