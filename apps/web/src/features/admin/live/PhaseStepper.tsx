import { Check } from 'lucide-react';
import type { Phase } from '@sq/shared';
import { cn } from '@/lib/format';

const STEPS = ['대기실', '문제 진행', '최종 결과', '시상식', '종료'] as const;

function stepIndex(phase: Phase): number {
  switch (phase) {
    case 'LOBBY':
      return 0;
    case 'QUESTION_ACTIVE':
    case 'QUESTION_REVEAL':
    case 'LEADERBOARD':
      return 1;
    case 'FINAL_RESULTS':
      return 2;
    case 'PRIZE_REVEAL':
      return 3;
    case 'ENDED':
      return 4;
    default:
      return 0;
  }
}

const SUB: Partial<Record<Phase, string>> = {
  QUESTION_ACTIVE: '응답 받는 중',
  QUESTION_REVEAL: '정답 공개',
  LEADERBOARD: '순위 발표',
};

export function PhaseStepper({ phase, index, total }: { phase: Phase; index: number; total: number }) {
  const cur = stepIndex(phase);
  return (
    <ol className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="진행 단계">
      {STEPS.map((label, i) => {
        const done = i < cur;
        const active = i === cur;
        const text = i === 1 && index >= 0 ? `문제 ${Math.min(index + 1, total)}/${total}` : label;
        return (
          <li key={label} className="flex shrink-0 items-center gap-1" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span className={cn('h-0.5 w-4 rounded-full', done || active ? 'bg-ink' : 'bg-n-200')} aria-hidden="true" />}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap',
                active ? 'bg-ink text-white' : done ? 'bg-n-100 text-n-700' : 'text-n-400',
              )}
            >
              {done && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
              {text}
              {active && SUB[phase] && <span className="font-semibold text-spark-300">· {SUB[phase]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
