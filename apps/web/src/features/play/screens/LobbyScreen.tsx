import { m } from 'motion/react';
import type { GameState } from '@/stores/game.reducer';
import { Avatar } from '@/ui/display';
import { AvatarCloud } from '@/game/AvatarCloud';
import { CountUp, ShapeDrift, WaitingDots } from '@/game/effects';
import { spring } from '@/design/motion';

export function LobbyScreen({ state }: { state: GameState }) {
  const me = state.me!;
  const midGame = state.room && state.room.phase !== 'LOBBY';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="relative overflow-hidden bg-spark-400 px-6 pt-8 pb-10 text-center text-ink">
        <ShapeDrift />
        <m.h1
          className="relative font-display text-[2rem] leading-tight"
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={spring.bouncy}
        >
          {midGame ? '곧 다음 문제부터 참여해요!' : '곧 시작해요!'}
        </m.h1>
        <p className="relative mt-1 flex items-center justify-center gap-2 font-semibold">
          진행자가 문제를 낼 때까지 기다려 주세요 <WaitingDots />
        </p>
        <div className="relative mt-6 flex flex-col items-center gap-3">
          <m.div className="motion-loop animate-float" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
            <Avatar id={me.id} name={me.nickname} size={96} me />
          </m.div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-black text-spark-400">나</span>
            <span className="max-w-[14rem] truncate text-xl font-extrabold" title={me.nickname}>
              {me.nickname}
            </span>
          </div>
        </div>
      </section>
      <section className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-5 pb-safe">
        <h2 className="text-center font-bold text-fg-muted">
          함께하는 사람 <CountUp value={state.rosterCount} className="text-lg font-black text-fg" />명
        </h2>
        <div className="fade-mask-y min-h-0 flex-1 overflow-y-auto py-2">
          <AvatarCloud roster={state.roster} total={state.rosterCount} meId={me.id} max={50} size={32} />
        </div>
      </section>
    </div>
  );
}
