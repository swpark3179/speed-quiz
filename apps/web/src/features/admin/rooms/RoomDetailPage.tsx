import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { m } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Copy, Download, FileText, KeyRound, Pencil, Play, RotateCcw, Rocket, Trash2, Undo2 } from 'lucide-react';
import { PHASE_LABELS, isLivePhase, type RoomDetailDto, type RoomResultsDto } from '@sq/shared';
import { choiceMeta } from '@/design/choices';
import { cappedStagger, spring } from '@/design/motion';
import { ChoiceShape } from '@/game/ChoiceShape';
import { errorText } from '@/lib/api';
import { cn, dateTime, num, pct, seconds } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Button } from '@/ui/Button';
import { Avatar, Badge, EmptyState, Spinner, StatusBadge } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import {
  useCloneRoom,
  useConfirmRoom,
  useDeleteRoom,
  useResetRoom,
  useRotatePresenterKey,
  useRoom,
  useRoomResults,
  useUnconfirmRoom,
} from '../api';
import { HBar, KindBadge, Medal, PageHeader, SectionCard, Stat } from '../components/common';
import { ConfirmSuccessModal, JoinInfo } from './JoinInfo';

type Ask = null | 'confirm' | 'unconfirm' | 'reset' | 'delete' | 'rotate';

function RankingTable({ results }: { results: RoomResultsDto }) {
  if (results.ranking.length === 0) return <EmptyState title="아직 참여자가 없어요" />;
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[520px] border-separate border-spacing-y-1.5 text-left">
        <thead>
          <tr className="text-xs font-bold text-fg-muted">
            <th className="w-14 px-3 py-1">순위</th>
            <th className="px-3 py-1">닉네임</th>
            <th className="px-3 py-1 text-right">점수</th>
            <th className="px-3 py-1 text-right">정답 수</th>
            <th className="px-3 py-1 text-right">평균 정답 시간</th>
            <th className="w-14 px-3 py-1 text-center">수상</th>
          </tr>
        </thead>
        <tbody>
          {results.ranking.map((r, i) => (
            <m.tr
              key={r.participantId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: cappedStagger(i) }}
              className={cn(r.isWinner ? 'bg-spark-50' : 'bg-n-25')}
            >
              <td className="tabular rounded-l-md px-3 py-2.5 text-lg font-black">{r.rank}</td>
              <td className="px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar id={r.participantId} name={r.nickname} size={32} />
                  <span className="truncate font-bold" title={r.nickname}>
                    {r.nickname}
                  </span>
                </span>
              </td>
              <td className="tabular px-3 py-2.5 text-right font-extrabold">{num(r.score)}</td>
              <td className="tabular px-3 py-2.5 text-right font-semibold">{r.correctCount}</td>
              <td className="tabular px-3 py-2.5 text-right font-semibold text-fg-muted">{seconds(r.avgCorrectMs, 2)}</td>
              <td className="rounded-r-md px-3 py-2.5 text-center">{r.isWinner ? <Medal rank={r.rank} /> : null}</td>
            </m.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionStats({ results }: { results: RoomResultsDto }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {results.questions.map((q, i) => {
        const max = Math.max(1, ...q.choices.map((c) => c.count));
        return (
          <m.article
            key={q.index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: cappedStagger(i, 0.05) }}
            className="flex flex-col gap-3 rounded-lg bg-n-25 p-4 ring-1 ring-line/60"
          >
            <header className="flex items-start gap-3">
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{q.index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <KindBadge kind={q.kind} />
                  {!q.closed && <Badge tone="neutral">미출제</Badge>}
                </div>
                <p className="mt-1 line-clamp-2 font-bold">{q.title || q.preview}</p>
              </div>
            </header>
            <div className="flex gap-6">
              <Stat label="정답률" value={`${pct(q.correctCount, q.answeredCount)}%`} />
              <Stat label="응답 수" value={`${q.answeredCount}명`} />
              <Stat label="평균 응답" value={seconds(q.avgElapsedMs)} />
            </div>
            <ul className="flex flex-col gap-2">
              {q.choices.map((c) => {
                const meta = choiceMeta(c.position);
                return (
                  <li key={c.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-xs" style={{ background: meta.base }} aria-label={`${meta.number}번`}>
                      <ChoiceShape shape={meta.shape} className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className={cn('mb-1 flex items-center gap-1 truncate text-sm', c.isCorrect ? 'font-extrabold' : 'font-semibold text-fg-muted')}>
                        {c.isCorrect && <Check className="size-4 shrink-0 text-success" strokeWidth={3} aria-label="정답" />}
                        {c.text}
                      </p>
                      <HBar value={c.count / max} color={meta.base} />
                    </div>
                    <span className="tabular w-10 text-right text-sm font-bold">{c.count}</span>
                  </li>
                );
              })}
            </ul>
          </m.article>
        );
      })}
    </div>
  );
}

function DraftItems({ room }: { room: RoomDetailDto }) {
  if (room.items.length === 0) return <EmptyState title="아직 선택한 문제가 없어요" />;
  return (
    <ol className="flex flex-col gap-2">
      {room.items.map((it, i) => (
        <li key={`${it.questionId}-${i}`} className={cn('flex items-center gap-3 rounded-md p-3', it.question ? 'bg-n-25' : 'bg-danger-tint')}>
          <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{i + 1}</span>
          {it.question ? (
            <>
              <KindBadge kind={it.question.kind} />
              <span className="min-w-0 flex-1 truncate font-bold">{it.question.title || it.question.preview}</span>
            </>
          ) : (
            <span className="font-bold text-danger-text">삭제된 문제</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function RoomDetailPage() {
  const roomId = Number(useParams().id);
  const navigate = useNavigate();
  const room = useRoom(roomId, { refetchInterval: 10_000 });
  const live = room.data ? isLivePhase(room.data.phase) : false;
  const results = useRoomResults(roomId, { enabled: !!room.data && room.data.phase !== 'DRAFT', refetchInterval: live ? 5000 : false });
  useDocumentTitle(room.data?.title ?? '퀴즈방');

  const confirm = useConfirmRoom();
  const unconfirm = useUnconfirmRoom();
  const reset = useResetRoom();
  const del = useDeleteRoom();
  const clone = useCloneRoom();
  const rotate = useRotatePresenterKey();
  const [ask, setAsk] = useState<Ask>(null);
  const [success, setSuccess] = useState<{ code: string; joinUrl: string; presenterUrl: string } | null>(null);

  if (room.isPending)
    return (
      <div className="flex justify-center py-24 text-n-400">
        <Spinner className="size-8" />
      </div>
    );
  if (room.isError)
    return (
      <div className="py-24 text-center">
        <p className="mb-4 text-lg font-bold">퀴즈방을 찾을 수 없어요.</p>
        <Link to="/admin/rooms" className="font-bold text-info underline">
          목록으로
        </Link>
      </div>
    );

  const r = room.data;
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  let actions: ReactNode = null;
  if (r.phase === 'DRAFT') {
    actions = (
      <>
        <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/admin/rooms/${r.id}/edit`)}>
          수정
        </Button>
        <Button icon={<Rocket className="size-5" />} disabled={r.items.length === 0} onClick={() => setAsk('confirm')}>
          확정하고 열기
        </Button>
      </>
    );
  } else if (r.phase === 'LOBBY') {
    actions = (
      <>
        <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => setAsk('unconfirm')}>
          확정 취소
        </Button>
        <Button variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => setAsk('rotate')}>
          진행 화면 링크 재발급
        </Button>
        <Button variant="ink" icon={<Play className="size-5" />} onClick={() => navigate(`/admin/rooms/${r.id}/live`)}>
          진행하기
        </Button>
      </>
    );
  } else if (live) {
    actions = (
      <>
        <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setAsk('reset')}>
          리허설 초기화
        </Button>
        <Button variant="ink" icon={<Play className="size-5" />} onClick={() => navigate(`/admin/rooms/${r.id}/live`)}>
          진행하기
        </Button>
      </>
    );
  } else {
    actions = (
      <>
        <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setAsk('delete')}>
          삭제
        </Button>
        <Button
          icon={<Copy className="size-4" />}
          loading={clone.isPending}
          onClick={() =>
            clone.mutate(r.id, {
              onSuccess: (c) => {
                toast.success('복제했어요. 설정을 확인하고 다시 열어 주세요.');
                navigate(`/admin/rooms/${c.id}/edit`);
              },
              onError: (err) => toast.error(errorText(err)),
            })
          }
        >
          복제해서 다시 열기
        </Button>
      </>
    );
  }

  const confirmDialogs: Record<Exclude<Ask, null>, { title: string; description: string; label: string; tone?: 'danger'; run: () => Promise<void> }> = {
    confirm: {
      title: '퀴즈방을 확정할까요?',
      description: '확정하면 참여자가 들어올 수 있고, 설정과 문제는 더 이상 바꿀 수 없어요.',
      label: '확정하고 열기',
      run: async () => {
        try {
          const c = await confirm.mutateAsync(r.id);
          setSuccess(c);
        } catch (err) {
          toast.error(errorText(err));
        }
      },
    },
    unconfirm: {
      title: '확정을 취소할까요?',
      description: '대기실에 들어와 있던 참여자는 모두 나가게 되고, 방은 작성 중 상태로 돌아가요.',
      label: '확정 취소',
      tone: 'danger',
      run: () => run(() => unconfirm.mutateAsync(r.id), '작성 중 상태로 되돌렸어요.'),
    },
    reset: {
      title: '리허설을 초기화할까요?',
      description: '모든 참여자와 응답 기록이 지워지고 대기실 단계로 돌아가요. 되돌릴 수 없어요.',
      label: '초기화',
      tone: 'danger',
      run: () => run(() => reset.mutateAsync(r.id), '대기실 단계로 초기화했어요.'),
    },
    delete: {
      title: '퀴즈방을 삭제할까요?',
      description: '결과 기록도 함께 삭제되고 되돌릴 수 없어요.',
      label: '삭제',
      tone: 'danger',
      run: async () => {
        try {
          await del.mutateAsync(r.id);
          toast.success('삭제했어요.');
          navigate('/admin/rooms');
        } catch (err) {
          toast.error(errorText(err));
        }
      },
    },
    rotate: {
      title: '진행 화면 링크를 새로 만들까요?',
      description: '이전에 공유한 진행 화면 주소로는 더 이상 접속할 수 없어요.',
      label: '재발급',
      run: () => run(() => rotate.mutateAsync(r.id), '새 진행 화면 링크를 만들었어요.'),
    },
  };
  const dlg = ask ? confirmDialogs[ask] : null;

  return (
    <>
      <PageHeader
        back={
          <Link to="/admin/rooms" className="inline-flex items-center gap-1 text-sm font-bold text-fg-muted hover:text-fg">
            <ArrowLeft className="size-4" /> 퀴즈방 목록
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.title}
            <StatusBadge status={r.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap gap-x-3">
            <span>{PHASE_LABELS[r.phase]}</span>
            <span>참여자 {r.participantCount}명</span>
            {r.startedAt && <span>시작 {dateTime(r.startedAt)}</span>}
            {r.finishedAt && <span>종료 {dateTime(r.finishedAt)}</span>}
          </span>
        }
        actions={actions}
      />

      <div className="flex flex-col gap-6">
        {r.phase !== 'DRAFT' && r.code && r.joinUrl && r.phase !== 'ENDED' && (
          <SectionCard title="참여 안내">
            <JoinInfo code={r.code} joinUrl={r.joinUrl} presenterUrl={r.presenterUrl} compact />
          </SectionCard>
        )}

        {r.phase === 'DRAFT' ? (
          <SectionCard title={`선택한 문제 ${r.items.length}개`}>
            <DraftItems room={r} />
          </SectionCard>
        ) : results.isPending ? (
          <div className="flex justify-center py-12 text-n-400">
            <Spinner className="size-8" />
          </div>
        ) : results.isError ? (
          <EmptyState title="결과를 불러오지 못했어요">{errorText(results.error)}</EmptyState>
        ) : (
          <>
            <SectionCard
              title="순위"
              description={live ? '진행 중에는 5초마다 새로 고쳐져요.' : undefined}
              actions={
                <div className="flex flex-wrap gap-2">
                  {r.phase === 'ENDED' && (
                    <a
                      href={`/api/admin/rooms/${r.id}/report.html`}
                      download
                      className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-ink px-3 text-sm font-bold text-white hover:bg-n-800"
                    >
                      <FileText className="size-4" /> 리포트 다운로드
                    </a>
                  )}
                  <a
                    href={`/api/admin/rooms/${r.id}/results.csv?type=ranking`}
                    download
                    className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-n-100 px-3 text-sm font-bold text-ink hover:bg-n-200"
                  >
                    <Download className="size-4" /> 순위 CSV
                  </a>
                  <a
                    href={`/api/admin/rooms/${r.id}/results.csv?type=answers`}
                    download
                    className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-n-100 px-3 text-sm font-bold text-ink hover:bg-n-200"
                  >
                    <Download className="size-4" /> 응답 기록 CSV
                  </a>
                </div>
              }
            >
              <RankingTable results={results.data} />
            </SectionCard>
            <SectionCard title="문제별 통계">
              <QuestionStats results={results.data} />
            </SectionCard>
          </>
        )}
      </div>

      {dlg && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setAsk(null)}
          title={dlg.title}
          description={dlg.description}
          confirmLabel={dlg.label}
          tone={dlg.tone}
          onConfirm={dlg.run}
        />
      )}
      {success && (
        <ConfirmSuccessModal
          open
          onOpenChange={(v) => !v && setSuccess(null)}
          roomId={r.id}
          code={success.code}
          joinUrl={success.joinUrl}
          presenterUrl={success.presenterUrl}
        />
      )}
    </>
  );
}
