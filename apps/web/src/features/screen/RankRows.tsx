import { m } from 'motion/react';
import type { LeaderboardEntry } from '@sq/shared';
import { Avatar } from '@/ui/display';
import { cappedStagger, spring } from '@/design/motion';
import { num } from '@/lib/format';
import { useRemPx } from './hooks';

/** Static ranking rows for the final / ended screens (stage units). */
export function RankRows({ entries, dense }: { entries: LeaderboardEntry[]; dense?: boolean }) {
  const remPx = useRemPx();
  return (
    <ol className="flex flex-col gap-[0.75rem]">
      {entries.map((e, i) => (
        <m.li
          key={e.participantId}
          className={`flex items-center gap-5 rounded-[1.25rem] bg-surface px-6 shadow-sm ring-1 ring-line/60 ${dense ? 'h-[4.25rem]' : 'h-[5rem]'}`}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring.gentle, delay: cappedStagger(i, 0.05, 0.5) }}
        >
          <span className="tabular w-[4.5rem] text-center text-[2.25rem] font-black text-fg-muted">{e.rank}</span>
          <Avatar id={e.participantId} name={e.nickname} size={Math.round(remPx * (dense ? 2.75 : 3.25))} />
          <span className="min-w-0 flex-1 truncate text-[2rem] font-bold" title={e.nickname}>
            {e.nickname}
          </span>
          <span className="text-[1.5rem] font-semibold text-fg-muted">정답 {e.correctCount}</span>
          <span className="tabular w-[11rem] text-right text-[2.25rem] font-black">{num(e.score)}</span>
        </m.li>
      ))}
    </ol>
  );
}
