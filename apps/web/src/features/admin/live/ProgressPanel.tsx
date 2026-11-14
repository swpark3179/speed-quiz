import { m } from 'motion/react';
import { Check, Gift, ListOrdered, Users } from 'lucide-react';
import type { AdminQuestionBrief, AdminSnapshot } from '@sq/shared';
import { choiceMeta } from '@/design/choices';
import { spring } from '@/design/motion';
import { ChoiceShape } from '@/game/ChoiceShape';
import { CountdownBar } from '@/game/Countdown';
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

/** One dot per question: done / current / upcoming. Purely progress — no question content. */
function QuestionTrack({ snap }: { snap: AdminSnapshot }) {
  const cur = snap.room.currentIndex;
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="문제 진행 현황">
      {snap.questions.map((q) => {
        const isCur = q.index === cur;
        return (
          <li
            key={q.roomQuestionId}
            aria-current={isCur ? 'step' : undefined}
            className={cn(
              'tabular flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-black',
              isCur ? 'bg-ink text-spark-400' : q.closed ? 'bg-success/15 text-success' : 'bg-n-100 text-n-500',
            )}
            title={`Q${q.index + 1}${q.closed ? ' · 완료' : isCur ? ' · 진행 중' : ' · 대기'}`}
          >
            {q.closed ? <Check className="size-3.5" strokeWidth={3} aria-label={`Q${q.index + 1} 완료`} /> : q.index + 1}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Host's main card. Shows how the game is going (which question, timer, who answered, results once
 * revealed) — never the upcoming question's text, choices or correct answer.
 */
export function ProgressPanel({ snap }: { snap: AdminSnapshot }) {
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
  const active = phase === 'QUESTION_ACTIVE';
  const revealed = phase === 'QUESTION_REVEAL' || phase === 'LEADERBOARD';
  // Meta only (time limit, multiplier) for the question in play, or the one that starts next.
  const brief = cur ? snap.questions[cur.question.index] : snap.questions[room.currentIndex + 1];
  const online = snap.participants.filter((p) => p.connected).length;

  if (phase === 'LOBBY' || !brief) {
    return (
      <Card className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Users className="size-5" aria-hidden="true" /> 대기실
          </h2>
          <Badge tone="info">시작 전</Badge>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="tabular text-5xl font-black">{num(online)}</span>
          <span className="text-xl font-bold text-fg-muted">명 대기 중</span>
          <span className="ml-auto text-sm font-semibold text-fg-muted">총 {num(snap.participants.length)}명 입장</span>
        </div>
        <QuestionTrack snap={snap} />
        <p className="text-sm text-fg-muted">
          총 {room.total}문제 · 준비되면 아래 <b>시작</b> 버튼으로 첫 문제를 내세요. 문제 내용은 참가자 화면과 진행 화면(PC)에서만 보여요.
        </p>
      </Card>
    );
  }

  const dist = active ? null : revealed ? snap.reveal?.distribution : undefined;
  const counts = dist ? new Map(dist.map((d) => [d.choiceId, d.count])) : null;
  const rv = snap.reveal;
  const rate = rv && rv.answeredCount > 0 ? Math.round((rv.correctCount / rv.answeredCount) * 100) : 0;

  return (
    <Card className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ink px-3 py-1 text-sm font-black text-spark-400">
            Q{brief.index + 1} / {room.total}
          </span>
          {!cur && <Badge tone="info">다음 출제</Badge>}
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
      </div>
      <QuestionTrack snap={snap} />
      {active && cur && <CountdownBar opensAt={cur.timing.opensAt} endsAt={cur.timing.endsAt} />}
      {revealed && rv && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="정답률" value={`${rate}%`} />
            <Stat label="정답" value={`${num(rv.correctCount)}명`} />
            <Stat label="응답" value={`${num(rv.answeredCount)}/${num(rv.activeCount)}`} />
          </div>
          <ChoiceRows choices={brief.choices} counts={counts} showCorrect />
          {rv.fastest[0] && (
            <p className="text-sm font-semibold text-fg-muted">
              최고 기록 {rv.fastest[0].nickname} {seconds(rv.fastest[0].elapsedMs, 2)}
            </p>
          )}
        </>
      )}
      {!revealed && !active && (
        <p className="text-sm text-fg-muted">시작 버튼을 누르면 이 문제가 참가자 화면과 진행 화면(PC)에 나가요.</p>
      )}
      {(revealed || active) && snap.questions[room.currentIndex + 1] && (
        <p className="flex items-center gap-2 border-t border-line pt-3 text-sm text-fg-muted">
          <ListOrdered className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-bold">다음 문제</span>
          <span>
            Q{room.currentIndex + 2}
            {snap.questions[room.currentIndex + 1]!.multiplier !== 1 && ` · 점수 ×${snap.questions[room.currentIndex + 1]!.multiplier}`}
          </span>
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-n-50 px-2 py-2.5 ring-1 ring-line/60">
      <p className="text-xs font-bold text-fg-muted">{label}</p>
      <p className="tabular text-xl font-black">{value}</p>
    </div>
  );
}
