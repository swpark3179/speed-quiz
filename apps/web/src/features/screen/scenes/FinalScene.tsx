import { m } from 'motion/react';
import { Gift, PartyPopper } from 'lucide-react';
import type { GameState } from '@/stores/game.reducer';
import { WaitingDots } from '@/game/effects';
import { spring } from '@/design/motion';
import { num } from '@/lib/format';
import { RankRows } from '../RankRows';

/** FINAL_RESULTS: ranks just outside the prizes + stats, building suspense for the ceremony. */
export function FinalScene({ state }: { state: GameState }) {
  const final = state.final!;
  const hasPrizes = final.winnerCount > 0;
  const entries = final.ranksBeyondPrize.slice(0, hasPrizes ? 8 : 10);
  return (
    <div className="absolute inset-0 grid grid-cols-[1fr_38rem] gap-[4rem] px-[5rem] py-[3.25rem]">
      <section className="flex min-h-0 flex-col">
        <h1 className="mb-6 font-display text-[4.5rem] leading-none">{hasPrizes ? '아쉽게 놓친 순위' : '최종 순위'}</h1>
        {entries.length ? (
          <RankRows entries={entries} dense />
        ) : (
          <p className="text-[2rem] font-bold text-fg-muted">모든 참가자가 시상 대상이에요!</p>
        )}
      </section>
      <aside className="flex flex-col justify-center gap-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            ['참가자', `${num(final.totalParticipants)}명`],
            ['문제', `${final.stats.questions}개`],
            ['평균 정답률', `${Math.round(final.stats.avgCorrectRate * 100)}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[1.5rem] bg-surface px-4 py-5 text-center shadow-sm ring-1 ring-line/60">
              <p className="text-[1.5rem] font-bold text-fg-muted">{k}</p>
              <p className="tabular text-[2.75rem] leading-tight font-black">{v}</p>
            </div>
          ))}
        </div>
        <m.div
          className="flex flex-col items-center gap-5 rounded-[2.25rem] bg-ink px-8 py-10 text-center text-white shadow-lg"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring.bouncy, delay: 0.4 }}
        >
          {hasPrizes ? (
            <>
              <Gift className="size-[5rem] text-spark-400" aria-hidden="true" />
              <p className="font-display text-[3.75rem] leading-tight">
                곧 시상식이
                <br />
                시작됩니다
              </p>
              <p className="text-[1.75rem] font-bold text-stage-muted">상위 {final.winnerCount}명을 공개할게요</p>
              <WaitingDots className="text-spark-400 [&>span]:size-[1rem]" />
            </>
          ) : (
            <>
              <PartyPopper className="size-[5rem] text-spark-400" aria-hidden="true" />
              <p className="font-display text-[3.5rem] leading-tight">수고하셨어요!</p>
            </>
          )}
        </m.div>
      </aside>
    </div>
  );
}

/** ENDED without prize winners. */
export function ThanksScene({ state }: { state: GameState }) {
  const top = state.ended?.top ?? state.final?.ranksBeyondPrize ?? [];
  return (
    <div className="absolute inset-0 grid grid-cols-[1fr_38rem] gap-[4rem] px-[5rem] py-[3.25rem]">
      <section className="flex min-h-0 flex-col">
        <h1 className="mb-6 font-display text-[4.5rem] leading-none">최종 순위</h1>
        <RankRows entries={top.slice(0, 10)} dense />
      </section>
      <aside className="flex flex-col items-center justify-center gap-6 text-center">
        <PartyPopper className="size-[7rem] text-spark-600" aria-hidden="true" />
        <p className="font-display text-[4.5rem] leading-tight">
          참여해 주셔서
          <br />
          감사합니다
        </p>
        <p className="text-[2rem] font-bold text-fg-muted">{state.room?.title}</p>
      </aside>
    </div>
  );
}
