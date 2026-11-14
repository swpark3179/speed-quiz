import { useState } from 'react';
import { m } from 'motion/react';
import { Check, Eye, EyeOff, Gift, ListOrdered } from 'lucide-react';
import type { AdminQuestionBrief, AdminSnapshot } from '@sq/shared';
import { choiceMeta } from '@/design/choices';
import { spring } from '@/design/motion';
import { ChoiceShape } from '@/game/ChoiceShape';
import { CountdownBar } from '@/game/Countdown';
import { QuestionBody } from '@/game/QuestionBody';
import { Badge, Card } from '@/ui/display';
import { cn, num, seconds } from '@/lib/format';

function ChoiceRows({
  choices,
  counts,
  showCorrect,
}: {
  choices: AdminQuestionBrief['choices'];
  counts: Map<number, number> | null;
  showCorrect: boolean;
}) {
  const max = counts ? Math.max(1, ...counts.values()) : 1;
  return (
    <ul className="flex flex-col gap-2">
      {choices.map((c) => {
        const meta = choiceMeta(c.position);
        const count = counts?.get(c.id) ?? 0;
        const correct = showCorrect && c.isCorrect;
        return (
          <li
            key={c.id}
            className={cn(
              'relative flex items-center gap-3 overflow-hidden rounded-md bg-n-50 py-2 pr-3 pl-2 ring-1 ring-line/60',
              correct && 'ring-2 ring-success',
            )}
          >
            {counts && (
              <m.span
                className="absolute inset-y-0 left-0 origin-left opacity-20"
                style={{ background: meta.base, width: '100%' }}
                initial={false}
                animate={{ scaleX: count / max }}
                transition={spring.layout}
                aria-hidden="true"
              />
            )}
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-sm text-white" style={{ background: meta.base }}>
              <ChoiceShape shape={meta.shape} className="size-5" />
            </span>
            <span className="relative w-5 shrink-0 text-center text-sm font-black text-fg-muted">{meta.number}</span>
            <span className="relative min-w-0 flex-1 font-semibold">{c.text}</span>
            {correct && (
              <span className="relative inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-white">
                <Check className="size-3.5" strokeWidth={3} /> 정답
              </span>
            )}
            {counts && <span className="tabular relative w-10 text-right text-lg font-black">{num(count)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function MaskToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 rounded-full bg-n-100 px-3 py-1.5 text-sm font-bold text-n-700 hover:bg-n-200"
      aria-pressed={show}
    >
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      {show ? '정답 가리기' : '정답 보기'}
    </button>
  );
}

/** Left column main card: what is happening with the current (or next) question / the ceremony. */
export function QuestionPanel({ snap }: { snap: AdminSnapshot }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const { room } = snap;
  const phase = room.phase;

  if (phase === 'FINAL_RESULTS' || phase === 'PRIZE_REVEAL' || phase === 'ENDED') {
    const revealed = new Set(snap.prizes.map((p) => p.rank));
    return (
      <Card className="p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Gift className="size-5 text-spark-600" aria-hidden="true" /> 수상자 ({snap.winners.length}명)
          </h2>
          <Badge tone={phase === 'ENDED' ? 'ink' : 'spark'}>
            {phase === 'ENDED' ? '종료' : `${revealed.size}/${snap.winners.length} 공개`}
          </Badge>
        </div>
        {snap.winners.length === 0 ? (
          <p className="text-fg-muted">점수를 얻은 참가자가 없어 시상 대상이 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {snap.winners.map((w) => {
              const shown = revealed.has(w.rank) || phase === 'ENDED';
              return (
                <li key={w.rank} className={cn('flex items-center gap-3 rounded-md px-3 py-2.5 ring-1 ring-line/60', shown ? 'bg-spark-50' : 'bg-n-50')}>
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black"
                    style={{ background: ['#FFC233', '#CDD3E0', '#E3A06A'][w.rank - 1] ?? '#17153B', color: w.rank <= 3 ? '#17153B' : '#fff' }}
                  >
                    {w.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold" title={w.nickname}>
                    {w.nickname}
                  </span>
                  <span className="tabular font-black">{num(w.score)}점</span>
                  <Badge tone={shown ? 'success' : 'neutral'}>{shown ? '공개됨' : '대기'}</Badge>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-4 text-sm text-fg-muted">수상자 목록은 진행자에게만 보여요. 진행 화면에서는 아래 등수부터 차례로 공개됩니다.</p>
      </Card>
    );
  }

  const cur = snap.current;
  const brief = cur ? snap.questions[cur.question.index] : snap.questions[room.currentIndex + 1];
  if (!brief) {
    return (
      <Card className="p-6">
        <p className="text-fg-muted">표시할 문제가 없어요.</p>
      </Card>
    );
  }
  const active = phase === 'QUESTION_ACTIVE';
  const revealed = phase === 'QUESTION_REVEAL' || phase === 'LEADERBOARD';
  const dist = active ? snap.live?.distribution : revealed ? snap.reveal?.distribution : undefined;
  const counts = dist ? new Map(dist.map((d) => [d.choiceId, d.count])) : null;
  const next = revealed || active ? snap.questions[room.currentIndex + 1] : undefined;

  return (
    <Card className="p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ink px-3 py-1 text-sm font-black text-spark-400">
            Q{brief.index + 1} / {room.total}
          </span>
          {!cur && <Badge tone="info">다음 출제 문제</Badge>}
          {active && (
            <Badge tone="success" dot pulse>
              응답 받는 중
            </Badge>
          )}
          {revealed && <Badge tone="ink">정답 공개됨</Badge>}
          <span className="text-sm font-semibold text-fg-muted">
            제한시간 {Math.round(brief.timeLimitMs / 1000)}초{brief.multiplier !== 1 && ` · 점수 ×${brief.multiplier}`}
          </span>
        </div>
        {!revealed && <MaskToggle show={showAnswer} onToggle={() => setShowAnswer((v) => !v)} />}
      </div>
      {active && cur && <CountdownBar opensAt={cur.timing.opensAt} endsAt={cur.timing.endsAt} className="mb-4" />}
      <div className="mb-4 max-h-56 overflow-y-auto rounded-md bg-n-25 px-4 py-3 ring-1 ring-line/50">
        {cur ? (
          <QuestionBody kind={cur.question.kind} body={cur.question.body} imageUrl={cur.question.imageUrl} variant="preview" />
        ) : (
          <p className="text-center text-lg font-semibold">{brief.title || brief.preview}</p>
        )}
      </div>
      <ChoiceRows choices={brief.choices} counts={counts} showCorrect={revealed || showAnswer} />
      {revealed && snap.reveal && (
        <p className="mt-3 text-sm font-semibold text-fg-muted">
          정답 {num(snap.reveal.correctCount)}명 / 응답 {num(snap.reveal.answeredCount)}명
          {snap.reveal.fastest[0] && ` · 최고 기록 ${snap.reveal.fastest[0].nickname} ${seconds(snap.reveal.fastest[0].elapsedMs, 2)}`}
        </p>
      )}
      {next && (
        <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm text-fg-muted">
          <ListOrdered className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-bold">다음 문제</span>
          <span className="min-w-0 truncate">{next.title || next.preview}</span>
        </p>
      )}
    </Card>
  );
}
