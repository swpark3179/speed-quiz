import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Crown, PartyPopper } from 'lucide-react';
import { CEREMONY_OPENING_MS, CEREMONY_TIMING, type CeremonyKind, type PrizeRevealPayload } from '@sq/shared';
import type { GameState } from '@/stores/game.reducer';
import { sfx } from '@/design/sounds';
import { burst, celebrate } from '@/design/confetti';
import { spring, stagger } from '@/design/motion';
import { serverClock } from '@/lib/clock';
import { useBeats } from '@/lib/time';
import { num } from '@/lib/format';
import { useRemPx } from '../hooks';
import { PrizeCard, type WinnerInfo } from '../ceremony/PrizeCard';
import { Flash, LightRays, Spotlight } from '../ceremony/fx';
import { PODIUM_BLOCK, STAGE_H, STAGE_W, ceremonySlots, grandShift, grandSlotOf, medal, wallSlots, type Slot } from '../ceremony/layout';

type StepPhase = 'build' | 'flipped' | 'done';
interface Step {
  rank: number;
  kind: CeremonyKind;
  phase: StepPhase;
  late: boolean;
}

const LIFT = { quick: 1.08, standard: 1.12, grand: 1.25 } as const;

function trembleFrames(kind: CeremonyKind): number[] {
  if (kind === 'quick') return [0, -2, 2, -2, 2, -2, 2, -2, 2, 0];
  // growing amplitude 1° → 4°
  return [0, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 3, -3.5, 3.5, -4, 4, 0];
}

/**
 * Prize ceremony (PRIZE_REVEAL) and the final winners wall (ENDED).
 * Everything is scheduled on the server clock: opening at (first.startAt − OPENING), each step at
 * startAt, the flip at flipAt, settle at startAt + total. Late beats jump to the end state.
 */
export function CeremonyScene({ state }: { state: GameState }) {
  const reduce = useReducedMotion();
  const remPx = useRemPx();
  const rootRef = useRef<HTMLDivElement>(null);
  const ended = state.room?.phase === 'ENDED';

  const prizes = useMemo(() => [...state.prizes].sort((a, b) => a.revealedCount - b.revealedCount), [state.prizes]);
  const winnerCount =
    state.final?.winnerCount ?? prizes[0]?.winnerCount ?? state.ended?.winners.length ?? 0;
  const latest: PrizeRevealPayload | null = prizes[prizes.length - 1] ?? null;
  const first = prizes.find((p) => p.first) ?? prizes[0] ?? null;

  const winners = useMemo(() => {
    const map = new Map<number, WinnerInfo>();
    for (const p of prizes) map.set(p.rank, { participantId: p.participantId, nickname: p.nickname, score: p.score });
    for (const w of state.ended?.winners ?? []) map.set(w.rank, { participantId: w.participantId, nickname: w.nickname, score: w.score });
    return map;
  }, [prizes, state.ended]);

  /* ---------- opening ---------- */
  const openingAt = first ? first.startAt - CEREMONY_OPENING_MS : null;
  const [opening, setOpening] = useState<'none' | 'dim' | 'dealt'>(() =>
    !first || ended || serverClock.now() > (openingAt ?? 0) + 600 ? 'dealt' : 'none',
  );
  const [dealAnimated, setDealAnimated] = useState(false);
  useBeats(first && !ended ? `open-${first.rank}` : null, openingAt, [
    {
      at: 0,
      run: (late) => {
        if (late) return setOpening('dealt');
        setOpening((o) => (o === 'dealt' ? o : 'dim'));
        sfx.whoosh();
      },
    },
    {
      at: 550,
      run: (late) => {
        setOpening('dealt');
        if (!late) setDealAnimated(true);
      },
    },
  ]);

  /* ---------- current step ---------- */
  const [step, setStep] = useState<Step | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const T = latest ? CEREMONY_TIMING[latest.kind] : null;

  const confettiAt = (slot: Slot | undefined, colors?: string[], count?: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || !slot) return void burst({ colors, count });
    const x = (rect.left + ((slot.x + slot.w / 2) / STAGE_W) * rect.width) / window.innerWidth;
    const y = (rect.top + ((slot.y + slot.h / 3) / STAGE_H) * rect.height) / window.innerHeight;
    void burst({ x, y, colors, count });
  };

  useBeats(
    latest && !ended ? `step-${latest.rank}` : null,
    latest?.startAt ?? null,
    latest && T
      ? [
          {
            at: 0,
            run: (late) => {
              setStep({ rank: latest.rank, kind: latest.kind, phase: 'build', late });
              setOpening('dealt');
              if (late) return;
              if (latest.kind === 'quick') sfx.drumroll(1.2);
              else if (latest.kind === 'standard') sfx.drumroll(1.9, true);
              else sfx.drumroll(2.5, true);
            },
          },
          {
            at: T.flipAt,
            run: (late) => {
              setStep({ rank: latest.rank, kind: latest.kind, phase: 'flipped', late });
              if (late) return;
              setFlashKey((k) => k + 1);
              const slot = ceremony.get(latest.rank);
              if (latest.kind === 'quick') {
                sfx.cymbal();
              } else if (latest.kind === 'standard') {
                sfx.ding();
                confettiAt(slot, [medal(latest.rank).bg, '#FFFFFF', '#FFE08A'], 110);
              } else {
                sfx.cymbal();
                sfx.fanfare();
                void celebrate(3000);
              }
            },
          },
          {
            at: T.total,
            run: (late) => setStep((s) => (s && s.rank === latest.rank ? { ...s, phase: 'done', late } : s)),
          },
        ]
      : [],
  );

  // celebratory burst when the final wall appears live (not on reconnect)
  const [wallLive] = useState(() => !ended);
  useEffect(() => {
    if (ended && wallLive) {
      sfx.chime();
      void burst({ count: 140 });
    }
  }, [ended, wallLive]);

  /* ---------- derived visuals ---------- */
  const revealedRanks = new Set<number>();
  for (const p of prizes) if (p !== latest) revealedRanks.add(p.rank);
  if (latest && step?.rank === latest.rank && step.phase !== 'build') revealedRanks.add(latest.rank);
  if (ended) for (const r of winners.keys()) revealedRanks.add(r);

  const ceremony = useMemo(() => ceremonySlots(winnerCount), [winnerCount]);
  const wall = useMemo(() => wallSlots(winnerCount), [winnerCount]);

  const activeStep = !ended && step && latest && step.rank === latest.rank ? step : null;
  const grandActive = activeStep?.kind === 'grand';
  const grandFlipped = grandActive && activeStep!.phase !== 'build';
  const baseGrand = ceremony.get(1);
  const grandSlot = baseGrand ? grandSlotOf(baseGrand) : undefined;

  const overlay = ended ? 0 : opening === 'none' ? 0 : grandActive ? (grandFlipped ? 0.8 : 0.97) : 0.9;
  const lightOnText = !ended && opening !== 'none';

  const slotFor = (rank: number): Slot => {
    if (ended) return wall.slots.get(rank)!;
    const s = ceremony.get(rank)!;
    if (grandActive && baseGrand) {
      if (rank === 1) return grandSlotOf(baseGrand);
      const d = grandShift(s, baseGrand);
      return { ...s, x: s.x + d.dx, y: s.y + d.dy };
    }
    return s;
  };
  const activeSlot = activeStep ? slotFor(activeStep.rank) : undefined;

  const ranks = Array.from({ length: winnerCount }, (_, i) => i + 1);
  const spotX = activeSlot ? activeSlot.x + activeSlot.w / 2 : STAGE_W / 2;
  const spotY = activeSlot ? activeSlot.y + activeSlot.h / 2 : STAGE_H / 2;
  const showSpot = !!activeStep && (activeStep.phase !== 'done' || grandActive);
  const raysOpacity = !activeStep ? 0 : activeStep.kind === 'grand' ? (grandFlipped ? 0.9 : 0) : activeStep.kind === 'standard' && activeStep.phase !== 'done' ? 0.3 : 0;
  const grandWinner = winners.get(1);

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden">
      {/* lights down */}
      <m.div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #2A2566 0%, #110E2E 55%, #07051A 100%)' }}
        initial={false}
        animate={{ opacity: overlay }}
        transition={{ duration: 0.5 }}
        aria-hidden="true"
      />

      <LightRays x={spotX} y={spotY} opacity={raysOpacity} />
      <Spotlight
        x={spotX}
        y={spotY}
        visible={showSpot}
        sweepMs={grandActive && activeStep!.phase === 'build' && !activeStep!.late ? CEREMONY_TIMING.grand.flipAt - 700 : undefined}
      />

      {/* title / banner */}
      <AnimatePresence mode="wait">
        {ended ? (
          <m.div
            key="banner"
            className="absolute inset-x-0 top-[3rem] z-20 flex items-center justify-center gap-6"
            initial={{ y: '-8rem', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={spring.bouncy}
          >
            <PartyPopper className="size-[5rem] -scale-x-100 text-spark-600" aria-hidden="true" />
            <div className="text-center">
              <h1 className="font-display text-[6rem] leading-none">축하합니다!</h1>
              <p className="mt-3 text-[1.9rem] font-bold text-fg-muted">
                {state.room?.title} · 참여해 주셔서 감사합니다
              </p>
            </div>
            <PartyPopper className="size-[5rem] text-spark-600" aria-hidden="true" />
          </m.div>
        ) : (
          opening !== 'none' &&
          !grandActive && (
            <m.h1
              key="title"
              className="absolute inset-x-0 top-[2.5rem] z-20 text-center font-display text-[5rem] leading-none text-white"
              initial={{ y: '-10rem', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={spring.bouncy}
            >
              <span className="text-spark-400">★</span> 시상식 <span className="text-spark-400">★</span>
            </m.h1>
          )
        )}
      </AnimatePresence>

      {/* podium blocks (final wall) */}
      {ended &&
        wall.podium.map((b, i) => (
          <m.div
            key={b.rank}
            className="absolute z-10 flex origin-bottom items-start justify-center rounded-t-[1.5rem] pt-4 font-display text-[4rem] leading-none shadow-md"
            style={{
              left: `${b.x}rem`,
              width: `${b.w}rem`,
              top: `${64 - PODIUM_BLOCK[b.rank]!}rem`,
              height: `${b.h}rem`,
              background: medal(b.rank).bg,
              color: medal(b.rank).fg,
            }}
            initial={wallLive ? { scaleY: 0 } : false}
            animate={{ scaleY: 1 }}
            transition={{ ...spring.heavy, delay: wallLive ? 0.2 + i * stagger.podium : 0 }}
          >
            {b.rank}
          </m.div>
        ))}

      {/* cards */}
      {opening === 'dealt' &&
        ranks.map((rank, i) => {
          const slot = slotFor(rank);
          const base = ceremony.get(rank)!;
          const isActive = activeStep?.rank === rank;
          const phase = isActive ? activeStep!.phase : null;
          const lifted = isActive && (phase !== 'done' || activeStep!.kind === 'grand');
          const dimmed = grandActive && rank !== 1;
          const kind = activeStep?.kind ?? 'quick';
          const tremble = isActive && phase === 'build' && !activeStep!.late && !reduce;
          const tremDur = (CEREMONY_TIMING[kind].flipAt - (kind === 'grand' ? 550 : 100)) / 1000;
          const dealFrom = {
            x: `${STAGE_W / 2 - (base.x + base.w / 2)}rem`,
            y: `${STAGE_H / 2 - (base.y + base.h / 2)}rem`,
            rotate: ((rank * 37) % 17) - 8,
            scale: 0.45,
            opacity: 0,
          };
          return (
            <m.div
              key={rank}
              layout
              transition={spring.layout}
              className="absolute z-20"
              style={{ left: `${slot.x}rem`, top: `${slot.y}rem`, width: `${slot.w}rem`, height: `${slot.h}rem` }}
            >
              <m.div
                className="h-full w-full"
                initial={dealAnimated ? dealFrom : false}
                animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: dimmed ? 0.4 : 1 }}
                transition={{ ...spring.gentle, delay: dealAnimated ? i * 0.12 : 0, opacity: { duration: 0.4 } }}
              >
                <m.div
                  className="h-full w-full"
                  initial={false}
                  animate={{
                    y: lifted ? '-1.25rem' : 0,
                    scale: lifted ? LIFT[kind] : 1,
                    rotate: tremble ? trembleFrames(kind) : 0,
                  }}
                  transition={{
                    y: spring.gentle,
                    scale: tremble ? { duration: tremDur * 0.9, ease: [0.2, 0, 0, 1] } : spring.gentle,
                    rotate: tremble ? { duration: tremDur, ease: 'linear' } : { duration: 0.2 },
                  }}
                >
                  <PrizeCard
                    rank={rank}
                    slot={slot}
                    winner={revealedRanks.has(rank) ? (winners.get(rank) ?? null) : null}
                    revealed={revealedRanks.has(rank)}
                    flipSeconds={isActive && !activeStep!.late ? (kind === 'grand' ? 0.7 : 0.5) : 0}
                    remPx={remPx}
                  />
                </m.div>
              </m.div>
            </m.div>
          );
        })}

      {/* grand winner: crown + giant name */}
      <AnimatePresence>
        {grandFlipped && grandWinner && grandSlot && (
          <>
            <m.div
              key="crown"
              className="absolute z-30 flex justify-center"
              style={{ left: `${grandSlot.x}rem`, width: `${grandSlot.w}rem`, top: `${grandSlot.y - 9.5}rem` }}
              initial={activeStep!.late ? false : { y: '-24rem', opacity: 0, rotate: -12 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ opacity: 0 }}
              transition={{ ...spring.bouncy, delay: activeStep!.late ? 0 : 0.35 }}
            >
              <Crown className="size-[7rem] fill-spark-400 text-spark-600 drop-shadow-[0_0.4rem_0_rgba(0,0,0,0.25)]" aria-hidden="true" />
            </m.div>
            <m.div
              key="name"
              className="absolute inset-x-0 z-30 flex flex-col items-center text-center"
              style={{ top: `${winnerCount > 5 ? 44 : 53}rem` }}
              initial={activeStep!.late ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ ...spring.bouncy, delay: activeStep!.late ? 0 : 0.45 }}
            >
              <p className="max-w-[100rem] truncate font-display text-[7.5rem] leading-[1.05] text-spark-400 drop-shadow-[0_0.35rem_0_rgba(0,0,0,0.35)]">
                {grandWinner.nickname}
              </p>
              <p className="tabular mt-2 text-[2.5rem] font-black text-white">
                1위 · {num(grandWinner.score)}점
              </p>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* step caption (non-grand) */}
      <AnimatePresence>
        {activeStep && !grandActive && activeStep.phase === 'build' && (
          <m.p
            key={`cap-${activeStep.rank}`}
            className="absolute inset-x-0 bottom-[3.5rem] z-30 text-center font-display text-[3.25rem] text-white"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {activeStep.rank}위는…
          </m.p>
        )}
        {activeStep && !grandActive && activeStep.phase !== 'build' && winners.get(activeStep.rank) && (
          <m.p
            key={`win-${activeStep.rank}`}
            className="absolute inset-x-0 bottom-[3rem] z-30 truncate px-[6rem] text-center font-display text-[4rem] text-spark-400"
            initial={activeStep.late ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={spring.pop}
          >
            {activeStep.rank}위 {winners.get(activeStep.rank)!.nickname}
          </m.p>
        )}
        {!activeStep && opening === 'dealt' && !ended && prizes.length === 0 && (
          <m.p
            key="soon"
            className="absolute inset-x-0 bottom-[3.5rem] z-30 text-center font-display text-[3rem] text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            두근두근…
          </m.p>
        )}
      </AnimatePresence>

      {lightOnText && <span className="sr-only" aria-live="polite">{latest ? `${latest.rank}위 공개` : ''}</span>}
      <Flash flashKey={flashKey} />
    </div>
  );
}
