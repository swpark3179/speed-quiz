import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, Trophy } from 'lucide-react';
import { REVEAL_HIGHLIGHT_MS } from '@sq/shared';
import type { GameState, GameStandings } from '@/stores/game.reducer';
import { usePrefs } from '@/stores/prefs';
import { serverClock } from '@/lib/clock';
import { cn, num } from '@/lib/format';

/** Phase in which the strip is shown. Hidden in the lobby (nothing to rank yet) and during the ceremony (would spoil prizes). */
const VISIBLE = new Set(['QUESTION_ACTIVE', 'QUESTION_REVEAL', 'LEADERBOARD']);

/** The reveal animation on the phone ends this long after `reveal.at`; show new standings only then. */
const SETTLE_MS = REVEAL_HIGHLIGHT_MS + 1100;

const MEDAL = ['#FFC233', '#CDD3E0', '#E3A06A'];

/** Delay applying new standings until the reveal animation is over, so ranks don't hint at the answer early. */
function useSettled(standings: GameStandings | null): GameStandings | null {
  const [shown, setShown] = useState<GameStandings | null>(standings);
  useEffect(() => {
    if (!standings) return setShown(null);
    const wait = standings.at + SETTLE_MS - serverClock.now();
    if (wait <= 0) return setShown(standings);
    const t = window.setTimeout(() => setShown(standings), wait);
    return () => window.clearTimeout(t);
  }, [standings]);
  return shown;
}

/** Corner mini-ranking on participant phones: top N + my own rank. Collapsible, choice remembered. */
export function StandingsBar({ state }: { state: GameState }) {
  const open = usePrefs((p) => p.standingsOpen);
  const setPrefs = usePrefs((p) => p.set);
  const shown = useSettled(state.standings);
  const phase = state.room?.phase;
  const me = state.me;
  if (!phase || !VISIBLE.has(phase) || !shown || shown.top.length === 0 || !me) return null;

  const inTop = shown.top.some((e) => e.participantId === me.id);
  const myRank = shown.myRank;

  return (
    <section aria-label="현재 순위" className="relative z-[5] border-b border-line/70 bg-surface px-3 py-1.5">
      <button
        type="button"
        onClick={() => setPrefs({ standingsOpen: !open })}
        aria-expanded={open}
        className="flex min-h-7 w-full items-center gap-1.5 text-left text-xs font-bold text-fg-muted"
      >
        <Trophy className="size-3.5 text-spark-600" aria-hidden="true" />
        <span>현재 순위</span>
        {myRank !== null && (
          <span className="ml-auto">
            내 순위 <span className="tabular text-sm font-black text-fg">{myRank}위</span>
            <span className="tabular"> / {num(shown.total)}명</span>
          </span>
        )}
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180', myRank === null && 'ml-auto')} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <ol className="grid grid-flow-col grid-rows-3 gap-x-4 gap-y-0.5 pt-1 pb-0.5">
              {shown.top.map((e) => {
                const mine = e.participantId === me.id;
                return (
                  <li
                    key={e.participantId}
                    className={cn('flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-px text-[0.8125rem]', mine && 'bg-spark-100 font-extrabold')}
                    aria-current={mine ? 'true' : undefined}
                  >
                    <span
                      className="tabular flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-black"
                      style={{ background: MEDAL[e.rank - 1] ?? 'var(--color-n-100)', color: 'var(--color-ink)' }}
                    >
                      {e.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold" title={e.nickname}>
                      {e.nickname}
                    </span>
                    <span className="tabular shrink-0 font-black">{num(e.score)}</span>
                  </li>
                );
              })}
            </ol>
            {!inTop && myRank !== null && (
              <p className="mt-1 flex items-center gap-1.5 rounded-sm bg-spark-100 px-1 py-px text-[0.8125rem] font-extrabold">
                <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-n-100 text-[0.6875rem] font-black text-ink">
                  {myRank}
                </span>
                <span className="min-w-0 flex-1 truncate">{me.nickname} (나)</span>
                <span className="tabular shrink-0 font-black">{num(me.score)}</span>
              </p>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}
