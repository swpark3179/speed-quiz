import { useEffect, useRef } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Users } from 'lucide-react';
import type { GameState } from '@/stores/game.reducer';
import { AvatarCloud } from '@/game/AvatarCloud';
import { ShapeDrift } from '@/game/effects';
import { sfx } from '@/design/sounds';
import { spring } from '@/design/motion';
import { num } from '@/lib/format';
import { Logo } from '@/ui/display';
import { JoinPanel } from '../JoinPanel';
import { useBumpKey, useRemPx } from '../hooks';

export function LobbyScene({ state }: { state: GameState }) {
  const room = state.room!;
  const remPx = useRemPx();
  const bump = useBumpKey(state.rosterCount);
  const lastPop = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (bump === 0) return;
    const now = Date.now();
    if (now - lastPop.current > 160) {
      lastPop.current = now;
      sfx.pop();
    }
  }, [bump]);

  return (
    <div className="absolute inset-0">
      <ShapeDrift />
      <div className="relative grid h-full grid-cols-[40%_60%] gap-0 px-[5rem] py-[3.5rem]">
        <section className="flex flex-col items-center justify-center pr-[3rem]">
          <JoinPanel joinUrl={room.joinUrl ?? ''} code={room.code} />
        </section>
        <section className="flex min-h-0 flex-col rounded-[2.5rem] bg-surface/80 p-[2.5rem] shadow-md ring-1 ring-line/60">
          <header className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <Logo className="text-[1.75rem]" />
              <h1 className="mt-2 truncate font-display text-[3.25rem] leading-tight" title={room.title}>
                {room.title}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-4 rounded-[1.75rem] bg-ink px-8 py-4 text-white">
              <Users className="size-[3rem] text-spark-400" aria-hidden="true" />
              <m.span
                key={bump}
                className="tabular text-[4.5rem] leading-none font-black"
                initial={{ scale: bump ? 1.25 : 1 }}
                animate={{ scale: 1 }}
                transition={spring.pop}
                aria-live="polite"
              >
                {num(state.rosterCount)}
              </m.span>
              <span className="text-[1.75rem] font-bold">명</span>
            </div>
          </header>
          <div className="relative mt-8 min-h-0 flex-1 overflow-hidden fade-mask-y">
            {state.rosterCount === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-fg-muted">
                <m.p
                  className="font-display text-[3rem]"
                  animate={reduce ? { opacity: 1 } : { opacity: [0.5, 1, 0.5] }}
                  transition={reduce ? { duration: 0 } : { duration: 2.4, repeat: Infinity }}
                >
                  참가자를 기다리고 있어요
                </m.p>
                <p className="text-[1.75rem] font-semibold">QR 코드를 찍으면 바로 입장할 수 있어요</p>
              </div>
            ) : (
              <AvatarCloud
                roster={state.roster}
                total={state.rosterCount}
                max={120}
                size={Math.round(remPx * 2.75)}
                className="gap-[0.75rem] text-[1.6rem]"
              />
            )}
          </div>
          <p className="mt-6 text-center text-[1.75rem] font-bold text-fg-muted">
            곧 시작해요! 문제 {room.total}개 · 상위 {room.prizeCount}명 시상
          </p>
        </section>
      </div>
    </div>
  );
}
