import { AnimatePresence, m } from 'motion/react';
import { Check, X } from 'lucide-react';
import type { AdminSnapshot } from '@sq/shared';
import { spring } from '@/design/motion';
import { Card } from '@/ui/display';
import { cn, num, pct, seconds } from '@/lib/format';

/** Big "answered / active" meter for the current question. */
export function ResponseMeter({ snap }: { snap: AdminSnapshot }) {
  const live = snap.live;
  const cur = snap.current;
  const answered = live?.answeredCount ?? (snap.reveal ? snap.reveal.answeredCount : (cur?.answeredCount ?? 0));
  const active = live?.activeCount ?? (snap.reveal ? snap.reveal.activeCount : (cur?.activeCount ?? snap.participants.filter((p) => p.connected).length));
  const ratio = active > 0 ? answered / active : 0;
  return (
    <Card className="p-5">
      <p className="text-sm font-bold text-fg-muted">응답 현황</p>
      <div className="mt-1 flex items-baseline gap-2">
        <m.span key={answered} className="tabular text-5xl font-black" initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={spring.pop}>
          {num(answered)}
        </m.span>
        <span className="tabular text-2xl font-bold text-fg-muted">/ {num(active)}</span>
        <span className="ml-auto text-lg font-black text-success">{pct(answered, active)}%</span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-n-100">
        <m.div
          className="h-full origin-left rounded-full bg-success"
          initial={false}
          animate={{ scaleX: Math.min(1, ratio) }}
          transition={spring.layout}
        />
      </div>
      {live && snap.room.phase === 'QUESTION_ACTIVE' && (
        <p className="mt-2 text-sm font-semibold text-fg-muted">현재 정답 {num(live.correctCount)}명</p>
      )}
    </Card>
  );
}

/** Latest answers (newest first). Correctness is masked unless the answer is visible. */
export function RecentFeed({ snap, showCorrect }: { snap: AdminSnapshot; showCorrect: boolean }) {
  const recent = snap.room.phase === 'QUESTION_ACTIVE' ? (snap.live?.recent ?? []) : [];
  return (
    <Card className="p-5">
      <p className="mb-2 text-sm font-bold text-fg-muted">최근 응답</p>
      {recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">{snap.room.phase === 'QUESTION_ACTIVE' ? '아직 응답이 없어요' : '문제가 진행 중일 때 표시돼요'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {recent.map((r) => (
              <m.li
                key={`${r.nickname}-${r.elapsedMs}`}
                layout="position"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={spring.gentle}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full',
                    !showCorrect ? 'bg-n-200 text-n-600' : r.correct ? 'bg-success text-white' : 'bg-danger text-white',
                  )}
                  aria-label={!showCorrect ? '응답' : r.correct ? '정답' : '오답'}
                >
                  {!showCorrect ? '·' : r.correct ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold" title={r.nickname}>
                  {r.nickname}
                </span>
                <span className="tabular text-fg-muted">{seconds(r.elapsedMs, 2)}</span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
