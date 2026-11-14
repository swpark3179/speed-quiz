import { useCallback, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { CheckCircle2, Timer, Zap } from 'lucide-react';
import { htmlToText, type CloseReason, type RevealPayload } from '@sq/shared';
import type { GameState } from '@/stores/game.reducer';
import { ChoiceTile, stageItemSpan } from '@/game/choices';
import { CountdownRing } from '@/game/Countdown';
import { QuestionBody } from '@/game/QuestionBody';
import { Stamp, WaitingDots } from '@/game/effects';
import { sfx } from '@/design/sounds';
import { spring } from '@/design/motion';
import { serverClock } from '@/lib/clock';
import { useBeats, useRemaining } from '@/lib/time';
import { cn, num, pct, seconds } from '@/lib/format';
import { DistributionChart, type RevealStage } from '../DistributionChart';
import { useBumpKey } from '../hooks';

const CLOSE_REASON: Record<CloseReason, string> = {
  TIMER: '시간 종료',
  ALL_ANSWERED: '모두 응답 완료',
  MANUAL: '진행자 마감',
};

export function QuestionScene({ state }: { state: GameState }) {
  const cur = state.current!;
  const q = cur.question;
  const phase = state.room!.phase;
  const reveal = state.reveal && state.reveal.roomQuestionId === q.roomQuestionId ? state.reveal : null;
  const revealing = !!reveal && phase !== 'QUESTION_ACTIVE';
  const toOpen = useRemaining(cur.timing.opensAt, 100);
  const open = toOpen <= 0;
  const remaining = useRemaining(cur.timing.endsAt, 250);
  const timeUp = open && remaining <= 0 && !revealing;
  const bump = useBumpKey(cur.answeredCount);

  const onSecond = useCallback((s: number) => {
    if (s === 0) sfx.timeUp();
    else if (s <= 5) sfx.tickUrgent();
    else sfx.tick();
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col gap-[1.75rem] px-[5rem] pt-[2.75rem] pb-[3rem]">
      {/* top bar */}
      <header className="flex h-[8.5rem] shrink-0 items-center justify-between gap-6">
        <div className="flex items-baseline gap-3 rounded-[1.75rem] bg-ink px-8 py-3 text-white">
          <span className="font-display text-[4rem] leading-none text-spark-400">Q{q.index + 1}</span>
          <span className="tabular text-[2.25rem] font-bold text-stage-muted">/ {q.total}</span>
        </div>
        <div className="flex items-center gap-4 rounded-full bg-surface px-8 py-3 shadow-sm ring-1 ring-line/70">
          <CheckCircle2 className="size-[2.5rem] text-success" aria-hidden="true" />
          <span className="text-[2rem] font-bold text-fg-muted">응답</span>
          <m.span
            key={bump}
            className="tabular text-[3.25rem] leading-none font-black"
            initial={{ scale: bump ? 1.2 : 1 }}
            animate={{ scale: 1 }}
            transition={spring.pop}
          >
            {num(cur.answeredCount)}
          </m.span>
          <span className="tabular text-[2.25rem] font-bold text-fg-muted">/ {num(cur.activeCount)}</span>
        </div>
        <div className="flex w-[18rem] justify-end">
          {revealing ? (
            <RevealBadge reveal={reveal!} />
          ) : (
            <CountdownRing opensAt={cur.timing.opensAt} endsAt={cur.timing.endsAt} size="8.5rem" onSecond={onSecond} />
          )}
        </div>
      </header>

      {/* question card → shrinks to a strip on reveal */}
      <m.section
        layout
        transition={spring.layout}
        className={cn(
          'relative shrink-0 overflow-hidden rounded-[2.25rem] bg-surface shadow-md ring-1 ring-line/60',
          revealing ? 'px-[3rem] py-[1.5rem]' : 'max-h-[29rem] px-[3.5rem] py-[2.5rem]',
        )}
      >
        {revealing ? (
          <m.p layout="position" className="line-clamp-2 text-center text-[2.25rem] leading-snug font-bold">
            {q.kind === 'HTML' ? htmlToText(q.body) : q.body}
          </m.p>
        ) : (
          <m.div layout="position" className={cn('flex h-full items-center gap-[3rem]', q.imageUrl && 'justify-between')}>
            <QuestionBody kind={q.kind} body={q.body} variant="stage" className="min-w-0 flex-1" />
            {q.imageUrl && (
              <img src={q.imageUrl} alt="" className="max-h-[24rem] w-[40%] shrink-0 rounded-[1.5rem] object-contain" />
            )}
          </m.div>
        )}
      </m.section>

      {/* lower area */}
      <div className="relative min-h-0 flex-1">
        {revealing ? (
          <RevealArea reveal={reveal!} choices={q.choices} />
        ) : open ? (
          <ChoicesGrid choices={q.choices} />
        ) : (
          <ReadyCount opensAt={cur.timing.opensAt} index={q.index} />
        )}
        <AnimatePresence>
          {timeUp && (
            <m.div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="rounded-[2rem] bg-ink/85 px-16 py-8">
                <Stamp tone="spark" className="text-[7rem]">
                  시간 종료!
                </Stamp>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ChoicesGrid({ choices }: { choices: { id: number; position: number; text: string }[] }) {
  const rows = choices.length <= 3 ? 1 : 2;
  return (
    <div className="grid h-full grid-cols-6 gap-[1.5rem]" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {choices.map((c, i) => (
        <m.div
          key={c.id}
          className={cn('min-h-0', stageItemSpan(choices.length, i))}
          initial={{ opacity: 0, y: 36, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring.pop, delay: i * 0.06 }}
        >
          <ChoiceTile position={c.position} text={c.text} className="h-full" />
        </m.div>
      ))}
    </div>
  );
}

function ReadyCount({ opensAt, index }: { opensAt: number; index: number }) {
  const left = useRemaining(opensAt, 100);
  const n = Math.max(1, Math.ceil(left / 1000));
  return (
    <div className="flex h-full items-center justify-center gap-[4rem]">
      <div className="text-center">
        <p className="font-display text-[5rem] leading-none text-spark-600 stage:text-spark-400">Q{index + 1}</p>
        <p className="mt-3 font-display text-[4.5rem] leading-none">준비!</p>
      </div>
      <AnimatePresence mode="popLayout">
        <m.div
          key={n}
          className="flex size-[15rem] items-center justify-center rounded-full bg-ink font-display text-[9rem] leading-none text-spark-400 shadow-lg"
          initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 1.4, opacity: 0, transition: { duration: 0.18 } }}
          transition={spring.pop}
          aria-live="assertive"
        >
          {n}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

function RevealBadge({ reveal }: { reveal: RevealPayload }) {
  return (
    <div className="flex items-center gap-3 rounded-full bg-ink px-6 py-3 text-[1.75rem] font-bold text-white">
      <Timer className="size-[2.25rem] text-spark-400" aria-hidden="true" />
      {CLOSE_REASON[reveal.closeReason]}
    </div>
  );
}

/**
 * Reveal timeline (t0 = reveal.at):
 *   0      "정답은…" + drumroll, bars grow (80ms stagger)
 *   1200   correct column highlight + ding
 *   1350   accuracy chip, fastest answerers, explanation
 */
function RevealArea({ reveal, choices }: { reveal: RevealPayload; choices: { id: number; position: number; text: string }[] }) {
  const reduce = useReducedMotion();
  const [instant] = useState(() => serverClock.now() - reveal.at > 1500);
  const [stage, setStage] = useState<RevealStage>(instant ? 'stats' : 'build');

  useBeats(reveal.roomQuestionId, reveal.at, [
    {
      at: 0,
      run: (late) => {
        if (!late) sfx.drumroll(1.15);
      },
    },
    {
      at: 1200,
      run: (late) => {
        setStage((s) => (s === 'stats' ? s : 'highlight'));
        if (!late) sfx.ding();
      },
    },
    { at: 1350, run: () => setStage('stats') },
  ]);

  const denom = Math.max(reveal.answeredCount, reveal.activeCount);
  const rate = pct(reveal.correctCount, denom);

  return (
    <div className="grid h-full grid-cols-[1fr_30rem] gap-[2.5rem]">
      <div className="flex min-h-0 flex-col">
        <div className="mb-4 h-[4.5rem] shrink-0">
          <AnimatePresence mode="wait">
            {stage === 'build' ? (
              <m.p
                key="q"
                className="flex items-center gap-4 font-display text-[3.75rem] leading-none"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12, transition: { duration: 0.12 } }}
              >
                정답은 <WaitingDots className="text-spark-600" />
              </m.p>
            ) : (
              <m.p
                key="a"
                className="font-display text-[3.75rem] leading-none text-success stage:text-[#5BE38F]"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring.pop}
              >
                정답 공개!
              </m.p>
            )}
          </AnimatePresence>
        </div>
        <div className="min-h-0 flex-1">
          <DistributionChart
            choices={choices}
            distribution={reveal.distribution}
            correctIds={reveal.correctChoiceIds}
            stage={stage}
            instant={instant}
          />
        </div>
      </div>
      <AnimatePresence>
        {stage === 'stats' && (
          <m.aside
            className="flex min-h-0 flex-col gap-5"
            initial={instant ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.gentle}
          >
            <div className="rounded-[1.75rem] bg-ink px-7 py-5 text-white">
              <p className="text-[1.6rem] font-bold text-stage-muted">정답률</p>
              <p className="tabular font-display text-[5rem] leading-none text-spark-400">{rate}%</p>
              <p className="mt-2 text-[1.5rem] font-semibold text-stage-muted">
                {num(reveal.correctCount)}명 정답 · {num(reveal.answeredCount)}명 응답
              </p>
            </div>
            {reveal.fastest.length > 0 && (
              <div className="rounded-[1.75rem] bg-surface px-7 py-5 shadow-sm ring-1 ring-line/60">
                <p className="mb-3 flex items-center gap-2 text-[1.6rem] font-extrabold">
                  <Zap className="size-[2rem] fill-spark-400 text-spark-600" aria-hidden="true" />
                  가장 빠른 정답자
                </p>
                <ol className="flex flex-col gap-2">
                  {reveal.fastest.map((f, i) => (
                    <m.li
                      key={f.nickname + i}
                      className="flex items-center gap-3 text-[1.75rem]"
                      initial={instant ? false : { opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...spring.gentle, delay: 0.1 + i * 0.08 }}
                    >
                      <span
                        className="flex size-[2.5rem] shrink-0 items-center justify-center rounded-full text-[1.4rem] font-black text-ink"
                        style={{ background: ['#FFC233', '#CDD3E0', '#E3A06A'][i] }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold" title={f.nickname}>
                        {f.nickname}
                      </span>
                      <span className="tabular font-semibold text-fg-muted">{seconds(f.elapsedMs, 2)}</span>
                    </m.li>
                  ))}
                </ol>
              </div>
            )}
            {reveal.explanation && (
              <div className="min-h-0 overflow-hidden rounded-[1.75rem] bg-spark-100 px-7 py-5 text-ink">
                <p className="mb-1 text-[1.5rem] font-extrabold">해설</p>
                <p className="line-clamp-5 text-[1.6rem] leading-snug font-semibold">{reveal.explanation}</p>
              </div>
            )}
          </m.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
