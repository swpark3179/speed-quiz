import { describe, expect, it } from 'vitest';
import { compareRanking, previewPoints, rankRows, scorePoints } from './scoring';
import { ScoringConfig, SCORING_PRESETS } from './schemas/settings';
import { graphemeLength, nicknameKey, validateNickname, firstGrapheme } from './nickname';
import { availableActions, nextPrizeRank, primaryAction } from './phases';
import { filterStyle, isSafeStyleValue } from './sanitize-policy';

const base = { elapsedMs: 0, timeLimitMs: 10_000 };

describe('scorePoints', () => {
  it('FLAT gives the same points to every correct rank', () => {
    const cfg = { mode: 'FLAT', points: 100 } as const;
    expect(scorePoints(cfg, { ...base, correctRank: 1 })).toBe(100);
    expect(scorePoints(cfg, { ...base, correctRank: 57 })).toBe(100);
  });

  it('RANK_STEP decreases by step and floors at minBonus', () => {
    const cfg = { mode: 'RANK_STEP', base: 500, firstBonus: 500, step: 50, minBonus: 0 } as const;
    expect(scorePoints(cfg, { ...base, correctRank: 1 })).toBe(1000);
    expect(scorePoints(cfg, { ...base, correctRank: 2 })).toBe(950);
    expect(scorePoints(cfg, { ...base, correctRank: 11 })).toBe(500);
    expect(scorePoints(cfg, { ...base, correctRank: 40 })).toBe(500);
    const floor = { mode: 'RANK_STEP', base: 100, firstBonus: 100, step: 30, minBonus: 20 } as const;
    expect(scorePoints(floor, { ...base, correctRank: 4 })).toBe(120);
  });

  it('RANK_TABLE uses the table and 0 bonus beyond it', () => {
    const cfg = { mode: 'RANK_TABLE', base: 100, table: [300, 200, 100] } as const;
    expect([1, 2, 3, 4, 10].map((r) => scorePoints(cfg, { ...base, correctRank: r }))).toEqual([400, 300, 200, 100, 100]);
  });

  it('TIME_RATIO interpolates by elapsed fraction and clamps', () => {
    const cfg = { mode: 'TIME_RATIO', maxPoints: 1000, minPoints: 500 } as const;
    expect(scorePoints(cfg, { correctRank: 1, elapsedMs: 0, timeLimitMs: 10_000 })).toBe(1000);
    expect(scorePoints(cfg, { correctRank: 1, elapsedMs: 5000, timeLimitMs: 10_000 })).toBe(750);
    expect(scorePoints(cfg, { correctRank: 1, elapsedMs: 10_000, timeLimitMs: 10_000 })).toBe(500);
    expect(scorePoints(cfg, { correctRank: 1, elapsedMs: 99_000, timeLimitMs: 10_000 })).toBe(500);
  });

  it('applies the per-question multiplier', () => {
    const cfg = { mode: 'FLAT', points: 100 } as const;
    expect(scorePoints(cfg, { ...base, correctRank: 1, multiplier: 2 })).toBe(200);
    expect(scorePoints(cfg, { ...base, correctRank: 1, multiplier: 1.5 })).toBe(150);
  });

  it('preview matches presets', () => {
    expect(previewPoints(SCORING_PRESETS.RANK_STEP.config, 3).map((p) => p.points)).toEqual([1000, 950, 900]);
    expect(previewPoints(SCORING_PRESETS.TIME_RATIO.config).length).toBe(5);
  });
});

describe('ScoringConfig validation', () => {
  it('rejects minBonus > firstBonus and increasing tables', () => {
    expect(ScoringConfig.safeParse({ mode: 'RANK_STEP', base: 0, firstBonus: 10, step: 1, minBonus: 20 }).success).toBe(false);
    expect(ScoringConfig.safeParse({ mode: 'RANK_TABLE', base: 0, table: [10, 20] }).success).toBe(false);
    expect(ScoringConfig.safeParse({ mode: 'TIME_RATIO', maxPoints: 10, minPoints: 20 }).success).toBe(false);
    expect(ScoringConfig.safeParse(SCORING_PRESETS.RANK_TABLE.config).success).toBe(true);
  });
});

describe('ranking', () => {
  const row = (id: number, score: number, correctCount: number, correctTimeMs: number, joinedAt = id) => ({
    id,
    score,
    correctCount,
    correctTimeMs,
    joinedAt,
  });
  it('orders by score, correct count, time, join time, id', () => {
    const rows = [row(1, 100, 1, 500), row(2, 200, 2, 900), row(3, 200, 3, 900), row(4, 200, 3, 800), row(5, 100, 1, 500, 0)];
    expect(rankRows(rows).map((r) => [r.id, r.rank])).toEqual([
      [4, 1],
      [3, 2],
      [2, 3],
      [5, 4],
      [1, 5],
    ]);
    expect(compareRanking(row(1, 0, 0, 0), row(2, 0, 0, 0))).toBeLessThan(0);
  });
});

describe('nickname', () => {
  it('normalizes and counts graphemes', () => {
    expect(validateNickname('  김​민지  ')).toEqual({ ok: true, value: '김민지' });
    expect(validateNickname('')).toEqual({ ok: false });
    expect(validateNickname('가'.repeat(13))).toEqual({ ok: false });
    expect(graphemeLength('👨‍👩‍👧‍👦가')).toBe(2);
    expect(firstGrapheme('👍좋아')).toBe('👍');
  });
  it('collides width/case/space variants', () => {
    expect(nicknameKey('ＡＢＣ')).toBe(nicknameKey('abc'));
    expect(nicknameKey('김 철수')).toBe(nicknameKey('김철수'));
  });
});

describe('phases', () => {
  const ctx = {
    phase: 'LOBBY' as const,
    currentIndex: -1,
    total: 3,
    winnerCount: 0,
    prizesRevealed: 0,
    showLeaderboardAfterEach: true,
  };
  it('primary action follows the game flow', () => {
    expect(primaryAction(ctx)).toMatchObject({ type: 'START_QUESTION', index: 0 });
    expect(primaryAction({ ...ctx, phase: 'QUESTION_ACTIVE', currentIndex: 0 })).toMatchObject({ type: 'CLOSE_QUESTION' });
    expect(primaryAction({ ...ctx, phase: 'QUESTION_REVEAL', currentIndex: 0 })).toMatchObject({ type: 'SHOW_LEADERBOARD' });
    expect(primaryAction({ ...ctx, phase: 'LEADERBOARD', currentIndex: 2 })).toMatchObject({ type: 'FINISH' });
    expect(primaryAction({ ...ctx, phase: 'FINAL_RESULTS', currentIndex: 2, winnerCount: 3 })).toMatchObject({
      type: 'REVEAL_PRIZE',
      rank: 3,
    });
    expect(primaryAction({ ...ctx, phase: 'PRIZE_REVEAL', currentIndex: 2, winnerCount: 3, prizesRevealed: 3 })).toMatchObject({
      type: 'END',
    });
    expect(nextPrizeRank({ winnerCount: 3, prizesRevealed: 1 })).toBe(2);
    expect(availableActions({ ...ctx, phase: 'QUESTION_ACTIVE', currentIndex: 0 })).toContain('CLOSE_QUESTION');
  });
});

describe('sanitize policy helpers', () => {
  it('keeps allowed style props only', () => {
    expect(filterStyle('color: red; position: fixed; background-color:#fff')).toBe('color: red; background-color: #fff');
    expect(isSafeStyleValue('url(http://x)')).toBe(false);
    expect(isSafeStyleValue('rgb(1, 2, 3)')).toBe(true);
  });
});
