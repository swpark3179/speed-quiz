import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Clock } from 'lucide-react';
import type { GameState } from '@/stores/game.reducer';
import { serverClock } from '@/lib/clock';
import { useRemaining } from '@/lib/time';
import { useHotkeys } from '@/hooks/dom';
import { haptic, HAPTIC } from '@/design/haptics';
import { spring, stagger } from '@/design/motion';
import { choiceMeta } from '@/design/choices';
import { ChoiceButton, isLongChoiceSet, phoneGridClass, phoneItemClass, type ChoiceState } from '@/game/choices';
import { ChoiceShape } from '@/game/ChoiceShape';
import { CountdownBar } from '@/game/Countdown';
import { QuestionBody } from '@/game/QuestionBody';
import { Stamp, WaitingDots } from '@/game/effects';
import { cn, seconds } from '@/lib/format';

export interface PendingAnswer {
  choiceId: number;
  status: 'sending' | 'queued' | 'acked' | 'rejected';
}

const GHOST_TAP_MS = 250;

export function QuestionScreen({
  state,
  pending,
  onSelect,
}: {
  state: GameState;
  pending: PendingAnswer | null;
  onSelect: (choiceId: number) => void;
}) {
  const cur = state.current!;
  const q = cur.question;
  const { opensAt, endsAt } = cur.timing;
  const toOpen = useRemaining(opensAt, 100);
  const remaining = useRemaining(endsAt, 1000);
  const open = toOpen <= 0;
  const timeUp = open && remaining <= 0;
  const answer = cur.myAnswer ? { choiceId: cur.myAnswer.choiceId, status: 'acked' as const } : pending;
  const locked = !!answer && answer.status !== 'rejected';
  const [showLocked, setShowLocked] = useState(false);
  const openedAt = useRef<number | null>(null);

  useEffect(() => {
    if (open && openedAt.current === null) openedAt.current = performance.now();
  }, [open]);

  // Morph the chosen tile into the "제출 완료" card shortly after the tap.
  useEffect(() => {
    if (!locked) return setShowLocked(false);
    const t = window.setTimeout(() => setShowLocked(true), 200);
    return () => window.clearTimeout(t);
  }, [locked]);

  // Gentle haptic ticks for the last 3 seconds if still unanswered.
  const secs = Math.ceil(remaining / 1000);
  useEffect(() => {
    if (open && !locked && secs > 0 && secs <= 3) haptic(HAPTIC.tick);
  }, [secs, open, locked]);

  const select = useCallback(
    (choiceId: number) => {
      if (!open || timeUp || locked) return;
      if (openedAt.current !== null && performance.now() - openedAt.current < GHOST_TAP_MS) return;
      onSelect(choiceId);
    },
    [open, timeUp, locked, onSelect],
  );

  useHotkeys(
    useCallback(
      (e: KeyboardEvent) => {
        const n = Number(e.key);
        if (n >= 1 && n <= q.choices.length) select(q.choices[n - 1]!.id);
      },
      [q.choices, select],
    ),
    open && !locked,
  );

  const long = isLongChoiceSet(q.choices.map((c) => c.text));
  const hasBody = !!q.body || !!q.imageUrl;
  const chosen = answer ? q.choices.find((c) => c.id === answer.choiceId) : undefined;

  if (!open) return <IntroScreen state={state} msLeft={toOpen} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-safe short:flex-row md:mx-auto md:w-full md:max-w-4xl md:px-6">
      <div className="flex min-h-0 flex-col gap-3 short:w-2/5">
        <div className="flex items-center gap-3">
          <CountdownBar opensAt={opensAt} endsAt={endsAt} className="flex-1" />
          <span className={cn('tabular w-10 text-right font-black', secs <= 5 ? 'text-danger-text' : 'text-fg')} aria-hidden="true">
            {Math.max(0, secs)}
          </span>
        </div>
        {hasBody && (
          <div className="flex max-h-[34dvh] min-h-0 flex-col rounded-lg bg-surface shadow-xs ring-1 ring-line/60 short:max-h-none short:flex-1">
            <div className="fade-mask-y min-h-0 overflow-y-auto px-4 py-4">
              <QuestionBody kind={q.kind} body={q.body} imageUrl={q.imageUrl} variant="mobile" />
            </div>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {showLocked && chosen ? (
            <LockedCard key="locked" state={state} choicePosition={chosen.position} text={chosen.text} status={answer!.status} />
          ) : (
            <m.div
              key="grid"
              className={cn('grid h-full gap-2.5 overflow-y-auto', phoneGridClass(q.choices.length, long))}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              {q.choices.map((c, i) => {
                let st: ChoiceState = 'idle';
                if (timeUp) st = 'disabled';
                else if (answer && answer.status !== 'rejected') st = answer.choiceId === c.id ? 'selected' : 'dimmed';
                return (
                  <m.div
                    key={c.id}
                    className={cn('flex min-h-0', phoneItemClass(q.choices.length, i, long))}
                    initial={{ opacity: 0, y: 20, scale: 0.94 }}
                    animate={
                      answer?.status === 'rejected' && answer.choiceId === c.id
                        ? { opacity: 1, y: 0, scale: 1, x: [0, -8, 8, -6, 6, 0] }
                        : { opacity: 1, y: 0, scale: 1 }
                    }
                    transition={{ ...spring.pop, delay: i * stagger.tiles }}
                  >
                    <ChoiceButton position={c.position} text={c.text} state={st} onSelect={() => select(c.id)} kbdHint className="h-full" />
                  </m.div>
                );
              })}
            </m.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {timeUp && !locked && (
            <m.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-n-600/95 text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              role="alert"
            >
              <Clock className="size-12" />
              <Stamp className="text-5xl">시간 종료</Stamp>
              <p className="font-semibold text-white/85">아쉬워요! 다음 문제를 기다려 주세요.</p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <p className="sr-only" aria-live="polite">
        {locked ? '제출했어요. 결과를 기다려 주세요.' : ''}
      </p>
    </div>
  );
}

function LockedCard({
  state,
  choicePosition,
  text,
  status,
}: {
  state: GameState;
  choicePosition: number;
  text: string;
  status: PendingAnswer['status'];
}) {
  const meta = choiceMeta(choicePosition);
  const cur = state.current!;
  const acked = status === 'acked';
  const elapsed = cur.myAnswer ? Math.max(0, cur.myAnswer.receivedAt - cur.timing.opensAt) : null;
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={spring.pop}
      className="flex h-full flex-col items-center justify-center gap-5 rounded-xl p-6 text-center text-white"
      style={{ background: meta.base }}
    >
      <div className="flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5">
        <ChoiceShape shape={meta.shape} className="size-5" />
        <span className="font-bold">
          {meta.number}번 · {text}
        </span>
      </div>
      <m.p className="font-display text-[2.4rem] leading-none" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}>
        {acked ? '제출 완료!' : status === 'queued' ? '전송 대기 중…' : '제출 중…'}
      </m.p>
      <p className="flex items-center gap-2 font-semibold text-white/90">
        다른 사람을 기다리는 중 <WaitingDots />
      </p>
      <div className="flex gap-3 text-sm font-bold">
        <span className="tabular rounded-full bg-black/20 px-3 py-1">
          응답 {cur.answeredCount}/{Math.max(cur.activeCount, cur.answeredCount)}
        </span>
        {elapsed !== null && <span className="tabular rounded-full bg-black/20 px-3 py-1">내 응답 {seconds(elapsed)}</span>}
      </div>
    </m.div>
  );
}

function IntroScreen({ state, msLeft }: { state: GameState; msLeft: number }) {
  const q = state.current!.question;
  const n = Math.max(1, Math.ceil(msLeft / 1000));
  const hasBody = !!q.body || !!q.imageUrl;
  useEffect(() => {
    // Preload the image while counting down.
    if (q.imageUrl) new Image().src = q.imageUrl;
  }, [q.imageUrl]);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-safe text-center">
      <m.p className="font-display text-2xl text-fg-muted" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        문제 {q.index + 1} / {q.total}
      </m.p>
      <div className="relative flex size-36 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-spark-400" />
        <AnimatePresence mode="popLayout">
          <m.span
            key={n}
            className="tabular relative font-display text-7xl text-ink"
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={spring.pop}
          >
            {n}
          </m.span>
        </AnimatePresence>
      </div>
      <p className="font-display text-3xl">준비!</p>
      {hasBody && (
        <m.div
          className="w-full max-w-xl rounded-lg bg-surface px-4 py-4 shadow-xs ring-1 ring-line/60"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.15 }}
        >
          <QuestionBody kind={q.kind} body={q.body} imageUrl={q.imageUrl} variant="mobile" />
        </m.div>
      )}
      <p className="sr-only" aria-live="polite">
        {serverClock.now() < state.current!.timing.opensAt ? '곧 보기가 열려요' : ''}
      </p>
    </div>
  );
}
