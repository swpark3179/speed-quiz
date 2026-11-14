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
  created_at: number;
  updated_at: number;
  updated_by_name?: string | null;
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

  list(query: { q?: string; kind?: QuestionKind; tag?: string; page: number; pageSize: number }): {
    items: QuestionListItem[];
    total: number;
  } {
    const where = ['q.deleted_at IS NULL'];
    const params: (string | number)[] = [];
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
      `SELECT q.*, (SELECT COUNT(*) FROM choices c WHERE c.question_id = q.id) AS choice_count
       FROM questions q WHERE ${w} ORDER BY q.updated_at DESC, q.id DESC LIMIT ? OFFSET ?`,
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
        updatedAt: r.updated_at,
      })),
    };
  }

  tags(): string[] {
    return this.db
      .all<{ value: string }>(
        'SELECT DISTINCT j.value AS value FROM questions q, json_each(q.tags) j WHERE q.deleted_at IS NULL ORDER BY j.value',
      )
      .map((r) => r.value);
  }

  get(id: number): QuestionDto {
    const row = this.db.get<QuestionRow>(
      `SELECT q.*, a.display_name AS updated_by_name FROM questions q LEFT JOIN admins a ON a.id = q.updated_by
       WHERE q.id = ? AND q.deleted_at IS NULL`,
      id,
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedByName: row.updated_by_name ?? null,
    };
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
        `INSERT INTO questions (kind, title, body, image_url, time_limit_sec, explanation, tags, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.kind,
        input.title,
        input.body,
        input.imageUrl,
        input.timeLimitSec,
        input.explanation,
        JSON.stringify(input.tags),
        adminId,
        adminId,
        now,
        now,
      ).lastInsertRowid;
      this.insertChoices(qid, input.choices);
      return qid;
    });
    return this.get(id);
  }

  update(id: number, raw: z.output<typeof QuestionInput>, adminId: number): QuestionDto {
    this.get(id);
    const input = this.normalize(raw);
    this.db.tx(() => {
      this.db.run(
        `UPDATE questions SET kind = ?, title = ?, body = ?, image_url = ?, time_limit_sec = ?, explanation = ?, tags = ?,
           version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?`,
        input.kind,
        input.title,
        input.body,
        input.imageUrl,
        input.timeLimitSec,
        input.explanation,
        JSON.stringify(input.tags),
        adminId,
        Date.now(),
        id,
      );
      this.db.run('DELETE FROM choices WHERE question_id = ?', id);
      this.insertChoices(id, input.choices);
    });
    return this.get(id);
  }

  private insertChoices(qid: number, choices: { text: string; isCorrect: boolean }[]): void {
    choices.forEach((c, i) => {
      this.db.run('INSERT INTO choices (question_id, position, text, is_correct) VALUES (?, ?, ?, ?)', qid, i, c.text, c.isCorrect ? 1 : 0);
    });
  }

  remove(id: number): void {
    this.get(id);
    this.db.run('UPDATE questions SET deleted_at = ? WHERE id = ?', Date.now(), id);
  }

  duplicate(id: number, adminId: number): QuestionDto {
    const q = this.get(id);
    return this.create(
      {
        kind: q.kind,
        title: q.title ? `${q.title} (복사본)`.slice(0, 100) : '',
        body: q.body,
        imageUrl: q.imageUrl,
        timeLimitSec: q.timeLimitSec,
        explanation: q.explanation,
        tags: q.tags,
        choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
      },
      adminId,
    );
  }
}
