import {
  AppError,
  QuestionInput,
  htmlToText,
  type QuestionDto,
  type QuestionFilters,
  type QuestionGroupDto,
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
  group_id: number | null;
  group_position: number | null;
  created_by: number | null;
  created_at: number;
  updated_at: number;
  updated_by_name?: string | null;
  owner_name?: string | null;
  group_name?: string | null;
  choice_count?: number;
}

interface GroupRow {
  id: number;
  name: string;
  created_by: number | null;
  created_at: number;
  updated_at: number;
  owner_name: string | null;
  question_count: number;
  public_count: number;
  match_count: number;
}

export interface QuestionListOptions extends QuestionFilters {
  groupId?: number;
  ungrouped?: boolean;
  page: number;
  pageSize: number;
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

  /**
   * Predicate (on alias `q`, with its group joined as `g`) for the q/kind/tag filters.
   * A search term matches the title, the body or the name of the question's group.
   */
  private static filterSql(f: QuestionFilters): { sql: string[]; params: string[] } {
    const sql: string[] = [];
    const params: string[] = [];
    if (f.q) {
      sql.push("(q.title LIKE ? ESCAPE '\\' OR q.body LIKE ? ESCAPE '\\' OR g.name LIKE ? ESCAPE '\\')");
      const like = `%${likeEscape(f.q)}%`;
      params.push(like, like, like);
    }
    if (f.kind) {
      sql.push('q.kind = ?');
      params.push(f.kind);
    }
    if (f.tag) {
      sql.push('EXISTS (SELECT 1 FROM json_each(q.tags) WHERE value = ?)');
      params.push(f.tag);
    }
    return { sql, params };
  }

  list(viewerId: number, query: QuestionListOptions): { items: QuestionListItem[]; total: number } {
    const where = ['q.deleted_at IS NULL', QuestionService.VISIBLE];
    const params: (string | number)[] = [viewerId];
    if (query.scope === 'mine') where.push('q.created_by = ?');
    else if (query.scope === 'public') where.push('(q.created_by IS NULL OR q.created_by <> ?)');
    if (query.scope === 'mine' || query.scope === 'public') params.push(viewerId);
    if (query.groupId !== undefined) {
      where.push('q.group_id = ?');
      params.push(query.groupId);
    } else if (query.ungrouped) {
      where.push('q.group_id IS NULL');
    }
    const f = QuestionService.filterSql(query);
    where.push(...f.sql);
    params.push(...f.params);
    const w = where.join(' AND ');
    const from = 'FROM questions q LEFT JOIN question_groups g ON g.id = q.group_id';
    const order = query.groupId !== undefined ? 'q.group_position, q.id' : 'q.updated_at DESC, q.id DESC';
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n ${from} WHERE ${w}`, ...params)!.n;
    const rows = this.db.all<QuestionRow>(
      `SELECT q.*, o.display_name AS owner_name, g.name AS group_name,
         (SELECT COUNT(*) FROM choices c WHERE c.question_id = q.id) AS choice_count
       ${from} LEFT JOIN admins o ON o.id = q.created_by
       WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
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
        groupId: r.group_id,
        groupName: r.group_name ?? null,
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
      `SELECT q.*, a.display_name AS updated_by_name, o.display_name AS owner_name, g.name AS group_name
       FROM questions q
       LEFT JOIN admins a ON a.id = q.updated_by
       LEFT JOIN admins o ON o.id = q.created_by
       LEFT JOIN question_groups g ON g.id = q.group_id
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
      groupId: row.group_id,
      groupName: row.group_name ?? null,
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
    if (input.groupId !== null) this.getOwnedGroup(input.groupId, adminId);
    const now = Date.now();
    const id = this.db.tx(() => {
      const qid = this.db.run(
        `INSERT INTO questions (kind, title, body, image_url, time_limit_sec, explanation, tags, is_public, group_id, group_position,
           created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.kind,
        input.title,
        input.body,
        input.imageUrl,
        input.timeLimitSec,
        input.explanation,
        JSON.stringify(input.tags),
        input.isPublic ? 1 : 0,
        input.groupId,
        input.groupId === null ? null : this.nextPosition(input.groupId),
        adminId,
        adminId,
        now,
        now,
      ).lastInsertRowid;
      this.insertChoices(qid, input.choices);
      this.touchGroups([input.groupId], now);
      return qid;
    });
    return this.get(id, adminId);
  }

  update(id: number, raw: z.output<typeof QuestionInput>, adminId: number): QuestionDto {
    const before = this.getOwned(id, adminId);
    const input = this.normalize(raw);
    if (input.groupId !== null && input.groupId !== before.groupId) this.getOwnedGroup(input.groupId, adminId);
    const now = Date.now();
    this.db.tx(() => {
      if (input.groupId !== before.groupId) {
        this.db.run(
          'UPDATE questions SET group_id = ?, group_position = ? WHERE id = ?',
          input.groupId,
          input.groupId === null ? null : this.nextPosition(input.groupId),
          id,
        );
      }
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
        now,
        id,
      );
      this.db.run('DELETE FROM choices WHERE question_id = ?', id);
      this.insertChoices(id, input.choices);
      this.touchGroups([before.groupId, input.groupId], now);
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
        // a copy of my own question stays in its group (handy for making similar questions)
        groupId: q.mine ? q.groupId : null,
        choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
      },
      adminId,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Groups                                                            */
  /* ---------------------------------------------------------------- */

  private nextPosition(groupId: number): number {
    return this.db.get<{ p: number }>('SELECT COALESCE(MAX(group_position), -1) + 1 AS p FROM questions WHERE group_id = ?', groupId)!.p;
  }

  private touchGroups(ids: (number | null)[], now = Date.now()): void {
    for (const id of new Set(ids)) if (id !== null) this.db.run('UPDATE question_groups SET updated_at = ? WHERE id = ?', now, id);
  }

  /**
   * Groups the viewer may see: their own (even empty) plus others' that hold at least one question the viewer can see.
   * Counts only cover questions visible to the viewer, so other admins never learn about private questions.
   */
  private groupRows(viewerId: number, filters: QuestionFilters, onlyId?: number): GroupRow[] {
    const f = QuestionService.filterSql(filters);
    const filtering = f.sql.length > 0;
    const match = filtering ? f.sql.join(' AND ') : '1';
    const where: string[] = [];
    const params: (string | number)[] = [...f.params, viewerId];
    if (filters.scope === 'mine') where.push('g.created_by = ?');
    else if (filters.scope === 'public') where.push('(g.created_by IS NULL OR g.created_by <> ?)');
    if (filters.scope === 'mine' || filters.scope === 'public') params.push(viewerId);
    if (onlyId !== undefined) {
      where.push('g.id = ?');
      params.push(onlyId);
    }
    params.push(viewerId);
    return this.db.all<GroupRow>(
      `SELECT g.id, g.name, g.created_by, g.created_at, g.updated_at, o.display_name AS owner_name,
         COUNT(q.id) AS question_count,
         COALESCE(SUM(q.is_public), 0) AS public_count,
         COALESCE(SUM(CASE WHEN q.id IS NOT NULL AND ${match} THEN 1 ELSE 0 END), 0) AS match_count
       FROM question_groups g
       LEFT JOIN admins o ON o.id = g.created_by
       LEFT JOIN questions q ON q.group_id = g.id AND q.deleted_at IS NULL AND ${QuestionService.VISIBLE}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY g.id
       HAVING (g.created_by = ? OR question_count > 0)${filtering && onlyId === undefined ? ' AND match_count > 0' : ''}
       ORDER BY g.updated_at DESC, g.id DESC`,
      ...params,
    );
  }

  /** Visible question ids per group, in group order. */
  private groupMembers(groupIds: number[], viewerId: number): Map<number, number[]> {
    const out = new Map<number, number[]>(groupIds.map((id) => [id, []]));
    if (groupIds.length === 0) return out;
    const rows = this.db.all<{ id: number; group_id: number }>(
      `SELECT q.id, q.group_id FROM questions q
       WHERE q.group_id IN (SELECT value FROM json_each(?)) AND q.deleted_at IS NULL AND ${QuestionService.VISIBLE}
       ORDER BY q.group_position, q.id`,
      JSON.stringify(groupIds),
      viewerId,
    );
    for (const r of rows) out.get(r.group_id)?.push(r.id);
    return out;
  }

  private groupDtos(rows: GroupRow[], viewerId: number): QuestionGroupDto[] {
    const members = this.groupMembers(
      rows.map((r) => r.id),
      viewerId,
    );
    return rows.map((r) => QuestionService.groupDto(r, viewerId, members.get(r.id) ?? []));
  }

  private static groupDto(r: GroupRow, viewerId: number, questionIds: number[]): QuestionGroupDto {
    return {
      id: r.id,
      name: r.name,
      questionCount: r.question_count,
      publicCount: r.public_count,
      matchCount: r.match_count,
      questionIds,
      mine: r.created_by === viewerId,
      ownerName: r.owner_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  listGroups(viewerId: number, filters: QuestionFilters = {}): QuestionGroupDto[] {
    return this.groupDtos(this.groupRows(viewerId, filters), viewerId);
  }

  getGroup(id: number, viewerId: number): QuestionGroupDto {
    const r = this.groupRows(viewerId, {}, id)[0];
    if (!r) throw new AppError('NOT_FOUND', '그룹을 찾을 수 없어요.');
    return this.groupDtos([r], viewerId)[0]!;
  }

  /** Visible AND owned by the viewer; otherwise 404 (hidden) or 403 (someone else's group). */
  private getOwnedGroup(id: number, viewerId: number): QuestionGroupDto {
    const g = this.getGroup(id, viewerId);
    if (!g.mine) throw new AppError('FORBIDDEN', '다른 관리자의 그룹은 바꿀 수 없어요.');
    return g;
  }

  private assertNameFree(name: string, adminId: number, exceptId = 0): void {
    const taken = this.db.get(
      'SELECT 1 FROM question_groups WHERE created_by = ? AND name = ? COLLATE NOCASE AND id <> ?',
      adminId,
      name,
      exceptId,
    );
    if (taken) throw new AppError('GROUP_NAME_TAKEN');
  }

  createGroup(input: { name: string }, adminId: number): QuestionGroupDto {
    this.assertNameFree(input.name, adminId);
    const now = Date.now();
    const id = this.db.run(
      'INSERT INTO question_groups (name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?)',
      input.name,
      adminId,
      now,
      now,
    ).lastInsertRowid;
    return this.getGroup(id, adminId);
  }

  renameGroup(id: number, input: { name: string }, adminId: number): QuestionGroupDto {
    this.getOwnedGroup(id, adminId);
    this.assertNameFree(input.name, adminId, id);
    this.db.run('UPDATE question_groups SET name = ?, updated_at = ? WHERE id = ?', input.name, Date.now(), id);
    return this.getGroup(id, adminId);
  }

  /** Deletes the group. Its questions become ungrouped, or are deleted too with `withQuestions`. */
  deleteGroup(id: number, adminId: number, withQuestions = false): { deletedQuestions: number } {
    this.getOwnedGroup(id, adminId);
    return this.db.tx(() => {
      const deletedQuestions = withQuestions
        ? this.db.run('UPDATE questions SET deleted_at = ? WHERE group_id = ? AND created_by = ? AND deleted_at IS NULL', Date.now(), id, adminId)
            .changes
        : 0;
      this.db.run('UPDATE questions SET group_id = NULL, group_position = NULL WHERE group_id = ?', id);
      this.db.run('DELETE FROM question_groups WHERE id = ?', id);
      return { deletedQuestions };
    });
  }

  /** Puts my questions into my group (appended in the given order), or takes them out of their group (`groupId` null). */
  moveQuestions(questionIds: number[], groupId: number | null, adminId: number): { moved: number } {
    const ids = [...new Set(questionIds)];
    const current = ids.map((id) => {
      const q = this.get(id, adminId);
      if (!q.mine) throw new AppError('FORBIDDEN', '다른 관리자의 문제는 그룹에 넣거나 뺄 수 없어요.');
      return q;
    });
    if (groupId !== null) this.getOwnedGroup(groupId, adminId);
    const now = Date.now();
    return this.db.tx(() => {
      let moved = 0;
      let pos = groupId === null ? null : this.nextPosition(groupId);
      for (const q of current) {
        if (q.groupId === groupId) continue;
        this.db.run('UPDATE questions SET group_id = ?, group_position = ? WHERE id = ?', groupId, pos, q.id);
        if (pos !== null) pos++;
        moved++;
      }
      this.touchGroups([groupId, ...current.map((q) => q.groupId)], now);
      return { moved };
    });
  }

  /** `questionIds` must be exactly the group's current (non-deleted) questions, in their new order. */
  reorderGroup(id: number, questionIds: number[], adminId: number): void {
    this.getOwnedGroup(id, adminId);
    const current = new Set(
      this.db.all<{ id: number }>('SELECT id FROM questions WHERE group_id = ? AND deleted_at IS NULL', id).map((r) => r.id),
    );
    if (new Set(questionIds).size !== questionIds.length || questionIds.length !== current.size || !questionIds.every((q) => current.has(q))) {
      throw new AppError('CONFLICT', '그룹의 문제가 바뀌었어요. 새로고침 후 다시 시도해 주세요.');
    }
    this.db.tx(() => {
      questionIds.forEach((qid, i) => this.db.run('UPDATE questions SET group_position = ? WHERE id = ?', i, qid));
      this.touchGroups([id]);
    });
  }

  /** Makes every question in my group public or private at once. */
  setGroupVisibility(id: number, isPublic: boolean, adminId: number): { changed: number } {
    this.getOwnedGroup(id, adminId);
    const now = Date.now();
    return this.db.tx(() => {
      const changed = this.db.run(
        `UPDATE questions SET is_public = ?, updated_by = ?, updated_at = ?
         WHERE group_id = ? AND created_by = ? AND deleted_at IS NULL AND is_public <> ?`,
        isPublic ? 1 : 0,
        adminId,
        now,
        id,
        adminId,
        isPublic ? 1 : 0,
      ).changes;
      this.touchGroups([id], now);
      return { changed };
    });
  }
}
