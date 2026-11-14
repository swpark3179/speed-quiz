export const PHASES = [
  'DRAFT',
  'LOBBY',
  'QUESTION_ACTIVE',
  'QUESTION_REVEAL',
  'LEADERBOARD',
  'FINAL_RESULTS',
  'PRIZE_REVEAL',
  'ENDED',
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  DRAFT: '작성 중',
  LOBBY: '대기실',
  QUESTION_ACTIVE: '문제 진행',
  QUESTION_REVEAL: '정답 공개',
  LEADERBOARD: '순위 발표',
  FINAL_RESULTS: '최종 결과',
  PRIZE_REVEAL: '시상식',
  ENDED: '종료',
};

export type ControlType =
  | 'START_QUESTION'
  | 'CLOSE_QUESTION'
  | 'SHOW_LEADERBOARD'
  | 'FINISH'
  | 'REVEAL_PRIZE'
  | 'END'
  | 'RESET'
  | 'ABORT';

export interface PhaseContext {
  phase: Phase;
  currentIndex: number;
  total: number;
  /** number of winners (min(prizeCount, participants with score > 0)), known from FINAL_RESULTS on */
  winnerCount: number;
  prizesRevealed: number;
  showLeaderboardAfterEach: boolean;
}

export interface PrimaryAction {
  type: ControlType;
  label: string;
  index?: number;
  rank?: number;
}

const LIVE: Phase[] = ['LOBBY', 'QUESTION_ACTIVE', 'QUESTION_REVEAL', 'LEADERBOARD', 'FINAL_RESULTS', 'PRIZE_REVEAL'];

export function isLivePhase(p: Phase): boolean {
  return LIVE.includes(p);
}

export function nextPrizeRank(ctx: Pick<PhaseContext, 'winnerCount' | 'prizesRevealed'>): number | null {
  const r = ctx.winnerCount - ctx.prizesRevealed;
  return r >= 1 ? r : null;
}

export function availableActions(ctx: PhaseContext): ControlType[] {
  const hasNext = ctx.currentIndex + 1 < ctx.total;
  const out: ControlType[] = [];
  switch (ctx.phase) {
    case 'LOBBY':
      if (ctx.total > 0) out.push('START_QUESTION');
      break;
    case 'QUESTION_ACTIVE':
      out.push('CLOSE_QUESTION');
      break;
    case 'QUESTION_REVEAL':
      out.push('SHOW_LEADERBOARD');
      out.push(hasNext ? 'START_QUESTION' : 'FINISH');
      break;
    case 'LEADERBOARD':
      out.push(hasNext ? 'START_QUESTION' : 'FINISH');
      break;
    case 'FINAL_RESULTS':
    case 'PRIZE_REVEAL':
      if (nextPrizeRank(ctx) !== null) out.push('REVEAL_PRIZE');
      out.push('END');
      break;
    default:
      break;
  }
  if (isLivePhase(ctx.phase)) out.push('RESET', 'ABORT');
  return out;
}

/** The single big "next" button in the control panel. */
export function primaryAction(ctx: PhaseContext): PrimaryAction | null {
  const hasNext = ctx.currentIndex + 1 < ctx.total;
  switch (ctx.phase) {
    case 'LOBBY':
      return ctx.total > 0 ? { type: 'START_QUESTION', index: 0, label: '첫 문제 출제' } : null;
    case 'QUESTION_ACTIVE':
      return { type: 'CLOSE_QUESTION', label: '마감하고 정답 공개' };
    case 'QUESTION_REVEAL':
      if (ctx.showLeaderboardAfterEach) return { type: 'SHOW_LEADERBOARD', index: ctx.currentIndex, label: '순위 보기' };
      return hasNext
        ? { type: 'START_QUESTION', index: ctx.currentIndex + 1, label: `다음 문제 출제 (${ctx.currentIndex + 2}/${ctx.total})` }
        : { type: 'FINISH', label: '최종 결과 보기' };
    case 'LEADERBOARD':
      return hasNext
        ? { type: 'START_QUESTION', index: ctx.currentIndex + 1, label: `다음 문제 출제 (${ctx.currentIndex + 2}/${ctx.total})` }
        : { type: 'FINISH', label: '최종 결과 보기' };
    case 'FINAL_RESULTS':
    case 'PRIZE_REVEAL': {
      const rank = nextPrizeRank(ctx);
      if (rank !== null) {
        const label = ctx.phase === 'FINAL_RESULTS' ? `시상식 시작 (${rank}등 공개)` : `${rank}등 공개`;
        return { type: 'REVEAL_PRIZE', rank, label };
      }
      return { type: 'END', label: '퀴즈 종료' };
    }
    default:
      return null;
  }
}
