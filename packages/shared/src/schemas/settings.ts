import { z } from 'zod';

const pts = z.number().int().min(0).max(10_000);

export const ScoringFlat = z.object({ mode: z.literal('FLAT'), points: z.number().int().min(1).max(10_000) });
export const ScoringRankStep = z.object({
  mode: z.literal('RANK_STEP'),
  base: pts,
  firstBonus: pts,
  step: pts,
  minBonus: pts,
});
export const ScoringRankTable = z.object({
  mode: z.literal('RANK_TABLE'),
  base: pts,
  table: z.array(pts).min(1).max(50),
});
export const ScoringTimeRatio = z.object({
  mode: z.literal('TIME_RATIO'),
  maxPoints: z.number().int().min(1).max(10_000),
  minPoints: pts,
});

export const ScoringConfig = z
  .discriminatedUnion('mode', [ScoringFlat, ScoringRankStep, ScoringRankTable, ScoringTimeRatio])
  .superRefine((cfg, ctx) => {
    if (cfg.mode === 'RANK_STEP' && cfg.minBonus > cfg.firstBonus) {
      ctx.addIssue({ code: 'custom', path: ['minBonus'], message: '최소 보너스는 1등 보너스보다 클 수 없어요.' });
    }
    if (cfg.mode === 'RANK_TABLE') {
      for (let i = 1; i < cfg.table.length; i++) {
        if (cfg.table[i]! > cfg.table[i - 1]!) {
          ctx.addIssue({ code: 'custom', path: ['table', i], message: '순위가 낮을수록 보너스가 같거나 작아야 해요.' });
          break;
        }
      }
    }
    if (cfg.mode === 'TIME_RATIO' && cfg.minPoints > cfg.maxPoints) {
      ctx.addIssue({ code: 'custom', path: ['minPoints'], message: '최소 점수는 최대 점수보다 클 수 없어요.' });
    }
  });
export type ScoringConfig = z.infer<typeof ScoringConfig>;
export type ScoringMode = ScoringConfig['mode'];

export const SCORING_PRESETS: Record<ScoringMode, { label: string; description: string; config: ScoringConfig }> = {
  FLAT: {
    label: '균등 점수',
    description: '정답을 맞힌 모든 사람이 같은 점수를 받아요.',
    config: { mode: 'FLAT', points: 100 },
  },
  RANK_STEP: {
    label: '선착순 차등',
    description: '먼저 맞힐수록 보너스가 커요. 순위마다 일정하게 줄어들어요.',
    config: { mode: 'RANK_STEP', base: 500, firstBonus: 500, step: 50, minBonus: 0 },
  },
  RANK_TABLE: {
    label: '순위별 보너스',
    description: '정답자 중 상위 몇 명에게만 정해진 보너스를 줘요.',
    config: { mode: 'RANK_TABLE', base: 100, table: [300, 200, 100] },
  },
  TIME_RATIO: {
    label: '시간 비례',
    description: '빨리 답할수록 높은 점수를 받아요(남은 시간에 비례).',
    config: { mode: 'TIME_RATIO', maxPoints: 1000, minPoints: 500 },
  },
};

export const RoomSettings = z.object({
  defaultTimeLimitSec: z.number().int().min(5).max(300).default(20),
  readyCountdownSec: z.number().int().min(0).max(10).default(3),
  scoring: ScoringConfig.default(SCORING_PRESETS.RANK_STEP.config),
  prizeCount: z.number().int().min(0).max(10).default(3),
  autoCloseWhenAllAnswered: z.boolean().default(true),
  showLeaderboardAfterEach: z.boolean().default(true),
  showQuestionOnDevices: z.boolean().default(true),
  allowLateJoin: z.boolean().default(true),
  maxParticipants: z.number().int().min(2).max(1000).default(500),
  leaderboardSize: z.number().int().min(3).max(20).default(10),
});
export type RoomSettings = z.output<typeof RoomSettings>;
export type RoomSettingsInput = z.input<typeof RoomSettings>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = RoomSettings.parse({});
