import '../zod-ko';
import { z } from 'zod';
import type { AdminRole } from './auth';

export const STATS_RANGES = [7, 30, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export const AdminStatsQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v): v is StatsRange => (STATS_RANGES as readonly number[]).includes(v))
    .default(30),
  /** Viewer's offset from UTC in minutes (east positive, e.g. KST = 540) so days bucket in local time. */
  tz: z.coerce.number().int().min(-840).max(840).default(0),
});
export type AdminStatsQuery = z.infer<typeof AdminStatsQuery>;

/** Usage figures for the main admin. Counts only — never question/room titles or bodies. */
export interface AdminStatsDto {
  generatedAt: number;
  days: number;
  totals: {
    admins: number;
    activeAdmins: number;
    mainAdmins: number;
    questions: number;
    publicQuestions: number;
    rooms: number;
    roomsDraft: number;
    roomsReady: number;
    roomsLive: number;
    roomsEnded: number;
    participants: number;
    gamesFinished: number;
  };
  perAdmin: AdminUsageRow[];
  /** One entry per local day, oldest first, including empty days. */
  daily: { date: string; questions: number; rooms: number; games: number }[];
}

export interface AdminUsageRow {
  id: number;
  username: string;
  displayName: string;
  role: AdminRole;
  disabled: boolean;
  questions: number;
  publicQuestions: number;
  rooms: number;
  gamesFinished: number;
  participants: number;
  createdAt: number;
  lastLoginAt: number | null;
}
