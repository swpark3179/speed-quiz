import { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ArrowUp, Crown } from 'lucide-react';
import type { LeaderboardEntry } from '@sq/shared';
import { cappedStagger, spring } from '@/design/motion';
import { Avatar } from '@/ui/display';
import { useBeats } from '@/lib/time';
import { cn } from '@/lib/format';
import { CountUp, Stamp } from './effects';
import { sfx } from '@/design/sounds';

type Stage = 'prev' | 'scored' | 'final';

/**
 * Presenter leaderboard. Timeline (t0 = event `at`):
 *   0ms     rows appear in the previous order with previous scores
 *   700ms   "+N" chips pop, scores count up
 *   1700ms  rows reorder (layout animation keyed by participant)
 *   2600ms  "선두 교체!" stamp when the leader changed
 */
export function StageLeaderboard({ entries, at, eventKey }: { entries: LeaderboardEntry[]; at: number; eventKey: string | number }) {
  const [stage, setStage] = useState<Stage>('prev');
  const [leaderChanged, setLeaderChanged] = useState(false);
  const prevLeader = useMemo(() => entries.find((e) => e.prevRank === 1)?.participantId, [entries]);
  const newLeader = entries[0]?.participantId;

  useBeats(eventKey, at, [
    { at: 0, run: (late) => setStage(late ? 'final' : 'prev') },
    {
      at: 700,
      run: (late) => {
        setStage((s) => (s === 'final' ? s : 'scored'));
        if (!late) sfx.pop();
      },
    },
    {
      at: 1700,
      run: (late) => {
        setStage('final');
        if (!late) sfx.whoosh();
      },
    },
    {
      at: 2600,
      run: (late) => {
        if (prevLeader !== undefined && newLeader !== prevLeader && !late) {
          setLeaderChanged(true);
          sfx.ding();
        }
      },
    },
  ]);

  const rows = useMemo(() => {
    if (stage !== 'final') {
      return [...entries].sort((a, b) => (a.prevRank ?? 9999) - (b.prevRank ?? 9999) || a.rank - b.rank);
    }
    return entries;
  }, [entries, stage]);

  return (
    <div className="relative flex w-full flex-col gap-3">
      <AnimatePresence>
        {leaderChanged && (
          <m.div className="pointer-events-none absolute -top-24 right-0 z-10" exit={{ opacity: 0 }}>
            <Stamp tone="danger" className="text-[4.5rem]" rotate={6}>
              선두 교체!
            </Stamp>
          </m.div>
        )}
      </AnimatePresence>
      {rows.map((e, i) => {
        const moved = stage === 'final' && e.prevRank !== null && e.prevRank > e.rank ? e.prevRank - e.rank : 0;
        const displayRank = stage === 'final' ? e.rank : (e.prevRank ?? '-');
        return (
          <m.div
            key={e.participantId}
            layout="position"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.layout, visualDuration: 0.6, delay: stage === 'prev' ? cappedStagger(i, 0.04) : 0 }}
            className={cn(
              'relative flex h-[5rem] items-center gap-5 overflow-hidden rounded-lg bg-surface px-6 shadow-sm ring-1 ring-line/60',
              stage === 'final' && e.rank === 1 && 'bg-spark-400 text-ink ring-spark-600',
            )}
          >
            {moved > 0 && (
              <m.span
                className="pointer-events-none absolute inset-0 bg-spark-300"
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.9 }}
                aria-hidden="true"
              />
            )}
            <span className="tabular relative w-16 text-center text-[2.25rem] font-black">{displayRank}</span>
            <Avatar id={e.participantId} name={e.nickname} size={52} className="relative" />
            <span className="relative flex-1 truncate text-[2rem] font-bold" title={e.nickname}>
              {e.nickname}
              {stage === 'final' && e.rank === 1 && <Crown className="ml-3 inline size-8 -translate-y-1 text-ink" aria-label="1위" />}
            </span>
            {moved > 0 && (
              <m.span
                className="relative inline-flex items-center gap-1 rounded-full bg-success px-3 py-1 text-[1.5rem] font-black text-white"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={spring.pop}
              >
                <ArrowUp className="size-6" strokeWidth={3} />
                {moved}
              </m.span>
            )}
            {stage !== 'prev' && e.delta > 0 && (
              <m.span
                className="relative rounded-full bg-ink px-3 py-1 text-[1.5rem] font-black text-spark-400"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...spring.pop, delay: cappedStagger(i, 0.03) }}
              >
                +{e.delta}
              </m.span>
            )}
            <CountUp
              className="relative w-40 text-right text-[2.25rem] font-black"
              value={stage === 'prev' ? e.score - e.delta : e.score}
              duration={0.9}
            />
          </m.div>
        );
      })}
    </div>
  );
}
