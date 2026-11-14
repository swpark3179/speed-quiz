import { AppError, RoomSettings, rankRows, type Phase, type QuestionKind, type RoomResultsDto } from '@sq/shared';
import type { Db } from '../db/driver';
import { previewText } from '../game/projections';

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: unknown[][]): string {
  // BOM so Excel opens Korean text as UTF-8.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export class ResultsService {
  constructor(private readonly db: Db) {}

  results(roomId: number): RoomResultsDto {
    const room = this.db.get<{
      id: number;
      title: string;
      phase: Phase;
      code: string | null;
      settings: string;
      started_at: number | null;
      finished_at: number | null;
    }>('SELECT * FROM rooms WHERE id = ?', roomId);
    if (!room) throw new AppError('NOT_FOUND');
    const settings = RoomSettings.parse(JSON.parse(room.settings));

    const parts = this.db.all<{ id: number; nickname: string; joined_at: number }>(
      'SELECT id, nickname, joined_at FROM participants WHERE room_id = ? AND kicked_at IS NULL',
      roomId,
    );
    const aggs = this.db.all<{ participant_id: number; score: number; correct_count: number; correct_time: number }>(
      `SELECT a.participant_id, SUM(a.points) AS score, COUNT(*) AS correct_count, SUM(a.elapsed_ms) AS correct_time
       FROM answers a JOIN room_questions q ON q.id = a.room_question_id
       WHERE q.room_id = ? AND q.closed_at IS NOT NULL AND a.is_correct = 1
       GROUP BY a.participant_id`,
      roomId,
    );
    const aggMap = new Map(aggs.map((a) => [a.participant_id, a]));
    const ranked = rankRows(
      parts.map((p) => {
        const a = aggMap.get(p.id);
        return {
          id: p.id,
          nickname: p.nickname,
          score: a?.score ?? 0,
          correctCount: a?.correct_count ?? 0,
          correctTimeMs: a?.correct_time ?? 0,
          joinedAt: p.joined_at,
        };
      }),
    );
    const winnerIds = new Set(
      ranked
        .filter((r) => r.score > 0)
        .slice(0, settings.prizeCount)
        .map((r) => r.id),
    );

    const rqs = this.db.all<{ id: number; position: number; kind: QuestionKind; title: string; body: string; closed_at: number | null }>(
      'SELECT id, position, kind, title, body, closed_at FROM room_questions WHERE room_id = ? ORDER BY position',
      roomId,
    );
    const questions = rqs.map((q) => {
      const choices = this.db.all<{ id: number; position: number; text: string; is_correct: number; n: number }>(
        `SELECT c.id, c.position, c.text, c.is_correct,
           (SELECT COUNT(*) FROM answers a JOIN participants p ON p.id = a.participant_id
             WHERE a.room_question_id = c.room_question_id AND a.choice_id = c.id AND p.kicked_at IS NULL) AS n
         FROM room_question_choices c WHERE c.room_question_id = ? ORDER BY c.position`,
        q.id,
      );
      const stat = this.db.get<{ answered: number; correct: number; avg: number | null }>(
        `SELECT COUNT(*) AS answered, SUM(a.is_correct) AS correct, AVG(a.elapsed_ms) AS avg
         FROM answers a JOIN participants p ON p.id = a.participant_id
         WHERE a.room_question_id = ? AND p.kicked_at IS NULL`,
        q.id,
      )!;
      return {
        index: q.position,
        kind: q.kind,
        title: q.title,
        preview: previewText(q.kind, q.body, 120),
        answeredCount: stat.answered,
        correctCount: stat.correct ?? 0,
        avgElapsedMs: stat.avg === null ? null : Math.round(stat.avg),
        closed: q.closed_at !== null,
        choices: choices.map((c) => ({ id: c.id, position: c.position, text: c.text, isCorrect: !!c.is_correct, count: c.n })),
      };
    });

    return {
      room: {
        id: room.id,
        title: room.title,
        phase: room.phase,
        code: room.code,
        startedAt: room.started_at,
        finishedAt: room.finished_at,
        prizeCount: settings.prizeCount,
      },
      ranking: ranked.map((r) => ({
        rank: r.rank,
        participantId: r.id,
        nickname: r.nickname,
        score: r.score,
        correctCount: r.correctCount,
        avgCorrectMs: r.correctCount ? Math.round(r.correctTimeMs / r.correctCount) : null,
        isWinner: winnerIds.has(r.id),
      })),
      questions,
    };
  }

  rankingCsv(roomId: number): string {
    const r = this.results(roomId);
    return toCsv([
      ['순위', '닉네임', '점수', '정답 수', '평균 정답 시간(초)', '수상'],
      ...r.ranking.map((x) => [
        x.rank,
        x.nickname,
        x.score,
        x.correctCount,
        x.avgCorrectMs === null ? '' : (x.avgCorrectMs / 1000).toFixed(2),
        x.isWinner ? 'O' : '',
      ]),
    ]);
  }

  answersCsv(roomId: number): string {
    const rows = this.db.all<{
      position: number;
      title: string;
      body: string;
      kind: QuestionKind;
      nickname: string;
      choice_position: number;
      choice_text: string;
      is_correct: number;
      correct_rank: number | null;
      elapsed_ms: number;
      points: number;
    }>(
      `SELECT q.position, q.title, q.body, q.kind, p.nickname, c.position AS choice_position, c.text AS choice_text,
              a.is_correct, a.correct_rank, a.elapsed_ms, a.points
       FROM answers a
       JOIN room_questions q ON q.id = a.room_question_id
       JOIN participants p ON p.id = a.participant_id
       JOIN room_question_choices c ON c.id = a.choice_id
       WHERE q.room_id = ? AND p.kicked_at IS NULL
       ORDER BY q.position, a.seq`,
      roomId,
    );
    return toCsv([
      ['문제 번호', '문제', '닉네임', '선택한 보기', '정답 여부', '정답 순위', '응답 시간(초)', '획득 점수'],
      ...rows.map((x) => [
        x.position + 1,
        x.title || previewText(x.kind, x.body, 60),
        x.nickname,
        `${x.choice_position + 1}. ${x.choice_text}`,
        x.is_correct ? '정답' : '오답',
        x.correct_rank ?? '',
        (x.elapsed_ms / 1000).toFixed(2),
        x.points,
      ]),
    ]);
  }
}
