import type { AdminStatsDto, AdminUsageRow, AdminRole } from '@sq/shared';
import type { Db } from '../db/driver';

const DAY = 86_400_000;

/**
 * Usage overview for the main admin. Deliberately selects counts only: question/room
 * titles and bodies stay private to their owners.
 */
export class StatsService {
  constructor(private readonly db: Db) {}

  overview(days: number, tzOffsetMin: number, now = Date.now()): AdminStatsDto {
    const db = this.db;
    const tz = tzOffsetMin * 60_000;
    const todayIdx = Math.floor((now + tz) / DAY);
    const firstIdx = todayIdx - days + 1;
    const since = firstIdx * DAY - tz;

    const n = (sql: string, ...p: number[]) => db.get<{ n: number }>(sql, ...p)!.n;
    const phases = db.all<{ phase: string; n: number }>('SELECT phase, COUNT(*) AS n FROM rooms GROUP BY phase');
    const byPhase = (pred: (p: string) => boolean) => phases.filter((r) => pred(r.phase)).reduce((a, r) => a + r.n, 0);

    const totals: AdminStatsDto['totals'] = {
      admins: n('SELECT COUNT(*) AS n FROM admins'),
      activeAdmins: n('SELECT COUNT(*) AS n FROM admins WHERE disabled = 0'),
      mainAdmins: n("SELECT COUNT(*) AS n FROM admins WHERE role = 'MAIN'"),
      questions: n('SELECT COUNT(*) AS n FROM questions WHERE deleted_at IS NULL'),
      publicQuestions: n('SELECT COUNT(*) AS n FROM questions WHERE deleted_at IS NULL AND is_public = 1'),
      rooms: byPhase(() => true),
      roomsDraft: byPhase((p) => p === 'DRAFT'),
      roomsReady: byPhase((p) => p === 'LOBBY'),
      roomsLive: byPhase((p) => p !== 'DRAFT' && p !== 'LOBBY' && p !== 'ENDED'),
      roomsEnded: byPhase((p) => p === 'ENDED'),
      participants: n('SELECT COUNT(*) AS n FROM participants WHERE kicked_at IS NULL'),
      gamesFinished: n('SELECT COUNT(*) AS n FROM rooms WHERE finished_at IS NOT NULL'),
    };

    const perAdmin = db
      .all<{
        id: number;
        username: string;
        display_name: string;
        role: AdminRole;
        disabled: number;
        created_at: number;
        last_login_at: number | null;
        questions: number;
        public_questions: number;
        rooms: number;
        games_finished: number;
        participants: number;
      }>(
        `SELECT a.id, a.username, a.display_name, a.role, a.disabled, a.created_at, a.last_login_at,
           (SELECT COUNT(*) FROM questions q WHERE q.created_by = a.id AND q.deleted_at IS NULL) AS questions,
           (SELECT COUNT(*) FROM questions q WHERE q.created_by = a.id AND q.deleted_at IS NULL AND q.is_public = 1) AS public_questions,
           (SELECT COUNT(*) FROM rooms r WHERE r.created_by = a.id) AS rooms,
           (SELECT COUNT(*) FROM rooms r WHERE r.created_by = a.id AND r.finished_at IS NOT NULL) AS games_finished,
           (SELECT COUNT(*) FROM participants p JOIN rooms r ON r.id = p.room_id
              WHERE r.created_by = a.id AND p.kicked_at IS NULL) AS participants
         FROM admins a ORDER BY a.id`,
      )
      .map(
        (r): AdminUsageRow => ({
          id: r.id,
          username: r.username,
          displayName: r.display_name,
          role: r.role,
          disabled: !!r.disabled,
          questions: r.questions,
          publicQuestions: r.public_questions,
          rooms: r.rooms,
          gamesFinished: r.games_finished,
          participants: r.participants,
          createdAt: r.created_at,
          lastLoginAt: r.last_login_at,
        }),
      );

    // Daily buckets in the viewer's local time. Questions count every creation (soft-deleted too);
    // rooms are hard-deleted, so only rooms that still exist are counted.
    const bucket = (sql: string): Map<number, number> =>
      new Map(db.all<{ d: number; n: number }>(sql, tz, since).map((r) => [r.d, r.n]));
    const q = bucket('SELECT CAST((created_at + ?) / 86400000 AS INTEGER) AS d, COUNT(*) AS n FROM questions WHERE created_at >= ? GROUP BY d');
    const r = bucket('SELECT CAST((created_at + ?) / 86400000 AS INTEGER) AS d, COUNT(*) AS n FROM rooms WHERE created_at >= ? GROUP BY d');
    const g = bucket(
      'SELECT CAST((finished_at + ?) / 86400000 AS INTEGER) AS d, COUNT(*) AS n FROM rooms WHERE finished_at IS NOT NULL AND finished_at >= ? GROUP BY d',
    );
    const daily: AdminStatsDto['daily'] = [];
    for (let i = firstIdx; i <= todayIdx; i++) {
      daily.push({
        date: new Date(i * DAY).toISOString().slice(0, 10),
        questions: q.get(i) ?? 0,
        rooms: r.get(i) ?? 0,
        games: g.get(i) ?? 0,
      });
    }

    return { generatedAt: now, days, totals, perAdmin, daily };
  }
}
