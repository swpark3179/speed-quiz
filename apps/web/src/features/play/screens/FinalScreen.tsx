import { useEffect } from 'react';
import { m } from 'motion/react';
import { Flame, Gift, Target, Trophy } from 'lucide-react';
import type { GameState } from '@/stores/game.reducer';
import { celebrate } from '@/design/confetti';
import { spring } from '@/design/motion';
import { CountUp, ShapeDrift, Stamp } from '@/game/effects';
import { Avatar } from '@/ui/display';
import { cn, num } from '@/lib/format';

export function FinalScreen({ state }: { state: GameState }) {
  const yf = state.youFinal;
  const me = state.me!;
  const winner = !!yf?.isWinner;

  useEffect(() => {
    if (winner) void celebrate(3000);
  }, [winner]);

  if (!yf) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Stamp tone="ink" className="text-4xl">
          퀴즈 종료!
        </Stamp>
        <p className="text-fg-muted">참여해 주셔서 감사해요.</p>
      </div>
    );
  }

  return (
    <div
      className={cn('relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 pb-safe text-center', winner && 'text-ink')}
      style={winner ? { background: 'linear-gradient(160deg, #FFE08A, #FFC233 55%, #F5A800)' } : undefined}
    >
      <ShapeDrift />
      <m.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy} className="relative">
        <Avatar id={me.id} name={me.nickname} size={88} me />
        {winner && (
          <m.span
            className="absolute -top-7 left-1/2 -translate-x-1/2 text-4xl"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...spring.bouncy, delay: 0.3 }}
            aria-hidden="true"
          >
            👑
          </m.span>
        )}
      </m.div>
      <div className="relative">
        <p className="font-bold text-fg-muted">{me.nickname}님의 최종 순위</p>
        <p className="font-display text-[4.5rem] leading-none">
          <CountUp value={yf.rank} from={yf.total} duration={1.2} />
          <span className="text-4xl">위</span>
        </p>
        <p className="mt-1 text-sm font-semibold text-fg-muted">참가자 {num(yf.total)}명 중</p>
      </div>
      {winner && (
        <m.div
          className="relative flex items-center gap-3 rounded-lg bg-ink px-5 py-4 text-left text-white shadow-lg"
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring.pop, delay: 0.5 }}
        >
          <Gift className="size-8 shrink-0 text-spark-400" />
          <div>
            <p className="font-display text-2xl text-spark-400">상품 당첨!</p>
            <p className="text-sm font-semibold text-white/85">진행자의 안내에 따라 상품을 받아 가세요.</p>
          </div>
        </m.div>
      )}
      <div className="relative grid w-full max-w-sm grid-cols-3 gap-2">
        <Stat icon={<Trophy className="size-5" />} label="점수" value={<CountUp value={yf.score} from={0} duration={1} />} />
        <Stat icon={<Target className="size-5" />} label="정답" value={`${yf.correctCount}개`} />
        <Stat icon={<Flame className="size-5" />} label="최대 연속" value={`${yf.bestStreak}번`} />
      </div>
      <p className="relative text-sm font-semibold text-fg-muted">참여해 주셔서 감사해요! 🙌</p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-surface/90 px-2 py-3 shadow-xs ring-1 ring-line/60">
      <span className="text-spark-600">{icon}</span>
      <span className="text-xs font-bold text-fg-muted">{label}</span>
      <span className="tabular text-lg font-black text-ink">{value}</span>
    </div>
  );
}
