import { m } from 'motion/react';
import { Zap } from 'lucide-react';
import { Avatar } from '@/ui/display';
import { num } from '@/lib/format';
import { medal, type Slot } from './layout';

export interface WinnerInfo {
  participantId: number;
  nickname: string;
  score: number;
}

/**
 * A prize card. Front = face-down (rank + "?"), back = winner. Flips with rotateY.
 * Inner sizes are in em, and the card sets its font-size from its width, so it scales with the slot.
 */
export function PrizeCard({
  rank,
  slot,
  winner,
  revealed,
  flipSeconds,
  remPx,
}: {
  rank: number;
  slot: Slot;
  winner: WinnerInfo | null;
  revealed: boolean;
  flipSeconds: number;
  remPx: number;
}) {
  const md = medal(rank);
  if (slot.variant === 'row') {
    return (
      <div
        className="flex h-full w-full items-center gap-[0.8em] rounded-[0.9em] bg-surface px-[0.9em] text-fg shadow-md ring-1 ring-line/60"
        style={{ fontSize: '1.9rem' }}
      >
        <span className="flex size-[1.8em] shrink-0 items-center justify-center rounded-full font-black" style={{ background: md.bg, color: md.fg }}>
          {rank}
        </span>
        {winner && <Avatar id={winner.participantId} name={winner.nickname} size={Math.round(remPx * 3.6)} />}
        <span className="min-w-0 flex-1 truncate font-bold" title={winner?.nickname}>
          {winner?.nickname ?? '?'}
        </span>
        <span className="tabular font-black">{winner ? num(winner.score) : ''}</span>
      </div>
    );
  }
  const em = slot.w / 18;
  return (
    <div className="h-full w-full" style={{ perspective: '80rem', fontSize: `${em}rem` }}>
      <m.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: flipSeconds, ease: [0.65, 0, 0.35, 1] }}
      >
        {/* face-down */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-between overflow-hidden rounded-[1.75em] bg-ink p-[1.4em] text-white shadow-lg ring-[0.3em] ring-spark-400"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, #FFC233 0 0.6em, transparent 0.6em 1.8em)' }}
            aria-hidden="true"
          />
          <span className="relative rounded-full px-[0.9em] py-[0.2em] font-display text-[2.4em] leading-tight" style={{ background: md.bg, color: md.fg }}>
            {rank}위
          </span>
          <span className="relative font-display text-[8em] leading-none text-spark-400">?</span>
          <Zap className="relative size-[3em] fill-spark-400 text-spark-400" aria-hidden="true" />
        </div>
        {/* revealed */}
        <div
          className="absolute inset-0 flex flex-col items-center overflow-hidden rounded-[1.75em] bg-surface text-fg shadow-lg ring-[0.3em]"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            ['--tw-ring-color' as string]: md.bg,
          }}
        >
          <div className="flex w-full items-center justify-center py-[0.7em] font-display text-[2.6em] leading-none" style={{ background: md.bg, color: md.fg }}>
            {rank}위
          </div>
          {winner && (
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-[0.6em] px-[1em] pb-[1em]">
              <Avatar id={winner.participantId} name={winner.nickname} size={Math.round(remPx * slot.w * 0.36)} />
              <p
                className="w-full text-center font-display text-[2.6em] leading-tight [overflow-wrap:anywhere] line-clamp-2"
                title={winner.nickname}
              >
                {winner.nickname}
              </p>
              <p className="tabular text-[1.9em] font-black text-fg-muted">{num(winner.score)}점</p>
            </div>
          )}
        </div>
      </m.div>
    </div>
  );
}
