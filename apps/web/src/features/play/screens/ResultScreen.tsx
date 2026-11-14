import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Flame } from 'lucide-react';
import { REVEAL_HIGHLIGHT_MS } from '@sq/shared';
import type { GameState } from '@/stores/game.reducer';
import { useBeats } from '@/lib/time';
import { haptic, HAPTIC } from '@/design/haptics';
import { burst } from '@/design/confetti';
import { choiceMeta } from '@/design/choices';
import { spring } from '@/design/motion';
import { ChoiceShape } from '@/game/ChoiceShape';
import { CountUp, RankChip, RevealCircle, Stamp, WaitingDots } from '@/game/effects';
import { cn, num, seconds } from '@/lib/format';

/**
 * Participant reveal (t0 = reveal.at): suspense until the projector highlights the answer (1200ms),
 * then colour wipe → stamp → points → rank. Phones never show the answer before the screen does.
 */
export function ResultScreen({ state }: { state: GameState }) {
  const reveal = state.reveal!;
  const you = state.you;
  const q = state.current?.question;
  const [beat, setBeat] = useState(0);
  const kind = !you?.answered ? 'timeout' : you.correct ? 'correct' : 'wrong';

  useBeats(reveal.roomQuestionId, reveal.at, [
    { at: 0, run: () => setBeat((b) => Math.max(b, 0)) },
    {
      at: REVEAL_HIGHLIGHT_MS,
      run: (late) => {
        setBeat((b) => Math.max(b, 1));
        if (!late) haptic(kind === 'correct' ? HAPTIC.correct : HAPTIC.wrong);
      },
    },
    {
      at: REVEAL_HIGHLIGHT_MS + 300,
      run: (late) => {
        setBeat((b) => Math.max(b, 2));
        if (!late && kind === 'correct') void burst({ y: 0.4 });
      },
    },
    { at: REVEAL_HIGHLIGHT_MS + 1100, run: () => setBeat((b) => Math.max(b, 3)) },
  ]);

  const leaderboardPhase = state.room?.phase === 'LEADERBOARD';
  const chosen = q?.choices.find((c) => c.id === you?.choiceId);
  const correctChoice = q?.choices.find((c) => reveal.correctChoiceIds.includes(c.id));
  const bg = kind === 'correct' ? 'var(--color-success)' : kind === 'wrong' ? 'var(--color-danger)' : 'var(--color-n-600)';
  const grad =
    kind === 'correct'
      ? 'linear-gradient(160deg, #12813F, #0B5F2E)'
      : kind === 'wrong'
        ? 'linear-gradient(160deg, #D12B2B, #9B1C3B)'
        : 'linear-gradient(160deg, #4F4B70, #28264A)';

  if (beat === 0) {
    const meta = chosen ? choiceMeta(chosen.position) : null;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {meta && chosen ? (
          <m.div
            className="flex items-center gap-3 rounded-lg px-5 py-4 text-white shadow-md"
            style={{ background: meta.base }}
            animate={{ rotate: [0, -2, 2, -2, 2, 0] }}
            transition={{ duration: 0.8, repeat: 1 }}
          >
            <ChoiceShape shape={meta.shape} className="size-7" />
            <span className="text-lg font-bold">{chosen.text}</span>
          </m.div>
        ) : null}
        <p className="font-display text-4xl">두근두근…</p>
        <p className="flex items-center gap-2 font-semibold text-fg-muted">
          화면에서 정답을 확인해요 <WaitingDots />
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden text-white">
      <RevealCircle color={bg} />
      <div className="absolute inset-0" style={{ background: grad, opacity: beat >= 2 ? 1 : 0, transition: 'opacity .3s' }} />
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-safe text-center">
        <Stamp className="text-[3.5rem]" rotate={kind === 'correct' ? -4 : 3}>
          {kind === 'correct' ? '정답!' : kind === 'wrong' ? '땡!' : '시간 초과'}
        </Stamp>
        <AnimatePresence>
          {beat >= 2 && kind === 'correct' && you && (
            <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.pop} className="flex flex-col items-center gap-1">
              <CountUp value={you.points} from={0} prefix="+" className="font-display text-[4rem] leading-none text-spark-300" />
              <p className="text-sm font-bold text-white/85">
                {you.correctRank}번째 정답 · {seconds(you.elapsedMs)}
              </p>
            </m.div>
          )}
          {beat >= 2 && kind !== 'correct' && correctChoice && (
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.gentle}
              className="flex max-w-sm items-center gap-3 rounded-lg bg-white px-4 py-3 text-left text-ink"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-sm"
                style={{ background: choiceMeta(correctChoice.position).base }}
              >
                <ChoiceShape shape={choiceMeta(correctChoice.position).shape} className="size-5" />
              </span>
              <span>
                <span className="block text-xs font-bold text-fg-muted">정답 · {choiceMeta(correctChoice.position).number}번</span>
                <span className="font-bold">{correctChoice.text}</span>
              </span>
            </m.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {beat >= 3 && you && (
            <m.div
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.gentle}
            >
              <div className="rounded-full bg-white/15 px-4 py-2">
                <RankChip rank={you.rank} prevRank={you.prevRank} size="lg" inverse />
                <span className="ml-2 text-sm font-semibold text-white/80">/ {num(you.total)}명</span>
              </div>
              <p className="tabular font-bold text-white/90">총 {num(you.totalScore)}점</p>
              {you.streak >= 2 && (
                <m.p
                  className="flex items-center gap-1.5 rounded-full bg-spark-400 px-3 py-1 font-extrabold text-ink"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...spring.bouncy, delay: 0.2 }}
                >
                  <Flame className="size-4" /> {you.streak}연속 정답!
                </m.p>
              )}
            </m.div>
          )}
        </AnimatePresence>
        {reveal.explanation && beat >= 3 && (
          <p className="max-w-md rounded-md bg-black/20 px-4 py-3 text-sm font-semibold text-white/95">💡 {reveal.explanation}</p>
        )}
        <p className={cn('mt-4 flex items-center gap-2 text-sm font-semibold text-white/75', beat < 3 && 'invisible')}>
          {leaderboardPhase ? '화면에서 순위를 확인해 보세요' : '다음 문제를 기다리는 중'} <WaitingDots />
        </p>
      </div>
      <p className="sr-only" aria-live="assertive">
        {kind === 'correct' ? `정답! ${you?.points ?? 0}점 획득` : kind === 'wrong' ? '오답이에요' : '시간이 초과됐어요'}
      </p>
    </div>
  );
}
