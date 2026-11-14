import { m } from 'motion/react';
import { Trophy } from 'lucide-react';
import type { GameState } from '@/stores/game.reducer';
import { StageLeaderboard } from '@/game/Leaderboard';
import { spring } from '@/design/motion';
import { num } from '@/lib/format';

export function LeaderboardScene({ state }: { state: GameState }) {
  const lb = state.leaderboard!;
  const total = state.room?.total ?? 0;
  return (
    <div className="absolute inset-0 grid grid-cols-[30rem_1fr] gap-[4rem] px-[5rem] py-[3.25rem]">
      <m.aside
        className="flex flex-col justify-center gap-6"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={spring.gentle}
      >
        <span className="flex size-[7rem] items-center justify-center rounded-[2rem] bg-ink text-spark-400 shadow-lg">
          <Trophy className="size-[4rem]" aria-hidden="true" />
        </span>
        <h1 className="font-display text-[5.5rem] leading-[1.05]">
          현재
          <br />
          순위
        </h1>
        <p className="text-[2rem] font-bold text-fg-muted">
          {lb.afterIndex + 1} / {total} 문제 후
        </p>
        <p className="text-[1.75rem] font-semibold text-fg-muted">참가자 {num(lb.total)}명</p>
        {lb.afterIndex + 1 < total ? (
          <p className="mt-4 rounded-[1.25rem] bg-spark-100 px-5 py-3 text-[1.6rem] font-bold text-ink">다음 문제가 곧 시작돼요</p>
        ) : (
          <p className="mt-4 rounded-[1.25rem] bg-spark-400 px-5 py-3 text-[1.6rem] font-bold text-ink">마지막 문제까지 끝났어요!</p>
        )}
      </m.aside>
      <div className="flex min-h-0 flex-col justify-center">
        <StageLeaderboard entries={lb.top} at={lb.at} eventKey={lb.afterIndex} />
      </div>
    </div>
  );
}
