import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Gift, Medal, MonitorPlay } from 'lucide-react';
import type { PrizeRevealPayload } from '@sq/shared';
import type { GameState } from '@/stores/game.reducer';
import { serverClock } from '@/lib/clock';
import { celebrate } from '@/design/confetti';
import { haptic, HAPTIC } from '@/design/haptics';
import { spring } from '@/design/motion';
import { ShapeDrift, Stamp, WaitingDots } from '@/game/effects';
import { num } from '@/lib/format';

const MEDAL = ['var(--color-gold)', 'var(--color-silver)', 'var(--color-bronze)'];

/** Shows ceremony progress as a ticker; each name appears when its card flips on the big screen. */
function useFlipped(prizes: PrizeRevealPayload[]): PrizeRevealPayload[] {
  const [, force] = useState(0);
  useEffect(() => {
    const timers = prizes
      .map((p) => p.flipAt - serverClock.now())
      .filter((d) => d > 0)
      .map((d) => window.setTimeout(() => force((x) => x + 1), d + 30));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [prizes]);
  const now = serverClock.now();
  return prizes.filter((p) => p.flipAt <= now).sort((a, b) => a.rank - b.rank);
}

export function CeremonyWaitScreen({ state }: { state: GameState }) {
  const flipped = useFlipped(state.prizes);
  const meId = state.me?.id;
  const mine = flipped.find((p) => p.participantId === meId);

  useEffect(() => {
    if (!mine) return;
    const late = serverClock.now() - mine.flipAt > 1500;
    if (late) return;
    haptic(HAPTIC.win);
    void celebrate(mine.rank === 1 ? 3000 : 1500);
  }, [mine]);

  if (mine) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-6 pb-safe text-center text-ink" style={{ background: 'linear-gradient(160deg, #FFD45C, #F5A800)' }}>
        <ShapeDrift />
        <m.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.bouncy}>
          <Medal className="size-20" style={{ color: mine.rank <= 3 ? '#17153B' : '#17153B' }} />
        </m.div>
        <Stamp tone="ink" className="text-[3.25rem]">
          {mine.rank}등 수상!
        </Stamp>
        <p className="text-xl font-extrabold">축하해요, {mine.nickname}님!</p>
        <p className="tabular text-lg font-bold">{num(mine.score)}점</p>
        <p className="max-w-xs rounded-md bg-white/60 px-4 py-3 font-semibold">진행자의 안내에 따라 상품을 받아 가세요 🎁</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 pb-safe text-center">
      <ShapeDrift />
      <m.div className="relative" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
        <span className="flex size-20 items-center justify-center rounded-full bg-spark-400 text-ink">
          <MonitorPlay className="size-10" />
        </span>
      </m.div>
      <div className="relative">
        <h2 className="font-display text-3xl">결과 발표 중</h2>
        <p className="mt-1 flex items-center justify-center gap-2 font-semibold text-fg-muted">
          화면을 주목해 주세요 <WaitingDots />
        </p>
      </div>
      <ul className="relative flex w-full max-w-sm flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {flipped.map((p) => (
            <m.li
              key={p.rank}
              layout="position"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={spring.pop}
              className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-sm ring-1 ring-line/60"
            >
              <span
                className="flex size-9 items-center justify-center rounded-full text-sm font-black text-ink"
                style={{ background: MEDAL[p.rank - 1] ?? 'var(--color-n-100)' }}
              >
                {p.rank}
              </span>
              <span className="flex-1 truncate text-left font-bold" title={p.nickname}>
                {p.nickname}
              </span>
              <span className="tabular text-sm font-bold text-fg-muted">{num(p.score)}점</span>
            </m.li>
          ))}
        </AnimatePresence>
        {flipped.length === 0 && state.final && state.final.winnerCount > 0 && (
          <li className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-4 font-semibold text-fg-muted">
            <Gift className="size-5" /> 상위 {state.final.winnerCount}명에게 상품이 있어요!
          </li>
        )}
      </ul>
    </div>
  );
}
