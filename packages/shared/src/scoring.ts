import type { ScoringConfig } from './schemas/settings';

export interface ScoreInput {
  /** 1-based rank among correct answers, by server receive order */
  correctRank: number;
  elapsedMs: number;
  timeLimitMs: number;
  multiplier?: number;
}

/** Points for a correct answer. Wrong / missing answers always score 0 (handled by caller). */
export function scorePoints(cfg: ScoringConfig, input: ScoreInput): number {
  const r = Math.max(1, Math.floor(input.correctRank));
  let raw: number;
  switch (cfg.mode) {
    case 'FLAT':
      raw = cfg.points;
      break;
    case 'RANK_STEP':
      raw = cfg.base + Math.max(cfg.minBonus, cfg.firstBonus - (r - 1) * cfg.step);
      break;
    case 'RANK_TABLE':
      raw = cfg.base + (cfg.table[r - 1] ?? 0);
      break;
    case 'TIME_RATIO': {
      const limit = Math.max(1, input.timeLimitMs);
      const f = Math.min(1, Math.max(0, input.elapsedMs / limit));
      raw = cfg.minPoints + (cfg.maxPoints - cfg.minPoints) * (1 - f);
      break;
    }
  }
  const m = input.multiplier ?? 1;
  return Math.max(0, Math.round(raw * m));
}

/** Preview table for the settings UI: points by correct-answer rank (and by elapsed fraction for TIME_RATIO). */
export function previewPoints(cfg: ScoringConfig, ranks = 10): { label: string; points: number }[] {
  if (cfg.mode === 'TIME_RATIO') {
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      label: f === 0 ? '즉시' : `${Math.round(f * 100)}% 경과`,
      points: scorePoints(cfg, { correctRank: 1, elapsedMs: f * 1000, timeLimitMs: 1000 }),
    }));
  }
  return Array.from({ length: ranks }, (_, i) => ({
    label: `${i + 1}등`,
    points: scorePoints(cfg, { correctRank: i + 1, elapsedMs: 0, timeLimitMs: 1000 }),
  }));
}

export interface RankingRow {
  id: number;
  score: number;
  correctCount: number;
  /** sum of elapsed ms over correct answers */
  correctTimeMs: number;
  joinedAt: number;
}

/** Strict total order: score desc → correct count desc → correct time asc → joined asc → id asc. */
export function compareRanking(a: RankingRow, b: RankingRow): number {
  return (
    b.score - a.score ||
    b.correctCount - a.correctCount ||
    a.correctTimeMs - b.correctTimeMs ||
    a.joinedAt - b.joinedAt ||
    a.id - b.id
  );
}

export function rankRows<T extends RankingRow>(rows: T[]): (T & { rank: number })[] {
  return [...rows].sort(compareRanking).map((r, i) => ({ ...r, rank: i + 1 }));
}
