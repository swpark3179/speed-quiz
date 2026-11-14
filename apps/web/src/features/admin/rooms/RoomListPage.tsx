import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { m } from 'motion/react';
import { toast } from 'sonner';
import { Copy, FileBarChart, Gift, ListChecks, Pencil, Play, Plus, Trash2, Trophy, Users } from 'lucide-react';
import type { RoomListItem } from '@sq/shared';
import { cappedStagger, spring } from '@/design/motion';
import { errorText } from '@/lib/api';
import { cn, dateTime } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Button, IconButton } from '@/ui/Button';
import { EmptyState, Spinner, StatusBadge } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import { useCloneRoom, useDeleteRoom, useRoomList } from '../api';
import { PageHeader } from '../components/common';
import { RoomCode } from './JoinInfo';

export default function RoomListPage() {
  useDocumentTitle('퀴즈방');
  const navigate = useNavigate();
  const rooms = useRoomList();
  const clone = useCloneRoom();
  const del = useDeleteRoom();
  const [toDelete, setToDelete] = useState<RoomListItem | null>(null);

  return (
    <>
      <PageHeader
        title="퀴즈방"
        description="문제를 골라 퀴즈방을 만들고, 확정하면 참여자가 들어올 수 있어요."
        actions={
          <Button icon={<Plus className="size-5" />} onClick={() => navigate('/admin/rooms/new')}>
            새 퀴즈방
          </Button>
        }
      />

      {rooms.isPending ? (
        <div className="flex justify-center py-20 text-n-400">
          <Spinner className="size-8" />
        </div>
      ) : rooms.isError ? (
        <EmptyState title="퀴즈방 목록을 불러오지 못했어요">{errorText(rooms.error)}</EmptyState>
      ) : rooms.data.length === 0 ? (
        <EmptyState icon={<Trophy className="size-12" />} title="아직 퀴즈방이 없어요">
          <p>문제은행에 문제를 만든 뒤 퀴즈방을 열어 보세요.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/questions/new')}>
              문제 만들기
            </Button>
            <Button icon={<Plus className="size-5" />} onClick={() => navigate('/admin/rooms/new')}>
              새 퀴즈방
            </Button>
          </div>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rooms.data.map((r, i) => {
            const live = r.status === 'OPEN' || r.status === 'LIVE';
            return (
              <m.li
                key={r.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: cappedStagger(i, 0.05) }}
                className={cn(
                  'flex flex-col overflow-hidden rounded-lg bg-surface shadow-sm ring-1 transition-shadow hover:shadow-md',
                  live ? 'ring-2 ring-spark-400' : 'ring-line/60',
                )}
              >
                <Link to={`/admin/rooms/${r.id}`} className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="line-clamp-2 text-lg font-extrabold">{r.title}</h2>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.code && r.status !== 'ENDED' ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-fg-muted">방 코드</span>
                      <RoomCode code={r.code} className="text-3xl text-ink" />
                    </div>
                  ) : (
                    <div className="h-9" aria-hidden="true" />
                  )}
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-fg-muted">
                    <div className="inline-flex items-center gap-1">
                      <ListChecks className="size-4" aria-hidden="true" />
                      <dt className="sr-only">문제 수</dt>
                      <dd>문제 {r.questionCount}개</dd>
                    </div>
                    <div className="inline-flex items-center gap-1">
                      <Users className="size-4" aria-hidden="true" />
                      <dt className="sr-only">참여자 수</dt>
                      <dd>{r.participantCount}명</dd>
                    </div>
                    <div className="inline-flex items-center gap-1">
                      <Gift className="size-4" aria-hidden="true" />
                      <dt className="sr-only">시상 인원</dt>
                      <dd>{r.prizeCount ? `${r.prizeCount}등까지 시상` : '시상 없음'}</dd>
                    </div>
                  </dl>
                  <p className="mt-auto text-xs text-n-500">
                    {r.createdByName ? `${r.createdByName} · ` : ''}
                    {dateTime(r.updatedAt)} 수정
                  </p>
                </Link>
                <div className="flex items-center gap-1 border-t border-line/70 bg-n-25 px-3 py-2">
                  {live && (
                    <Button size="sm" variant="ink" icon={<Play className="size-4" />} onClick={() => navigate(`/admin/rooms/${r.id}/live`)}>
                      진행하기
                    </Button>
                  )}
                  {r.status === 'DRAFT' && (
                    <Button size="sm" variant="primary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/admin/rooms/${r.id}/edit`)}>
                      수정
                    </Button>
                  )}
                  {r.status === 'ENDED' && (
                    <Button size="sm" variant="subtle" icon={<FileBarChart className="size-4" />} onClick={() => navigate(`/admin/rooms/${r.id}`)}>
                      결과 보기
                    </Button>
                  )}
                  <span className="flex-1" />
                  <IconButton
                    label="복제"
                    disabled={clone.isPending}
                    onClick={() =>
                      clone.mutate(r.id, {
                        onSuccess: (room) => {
                          toast.success('퀴즈방을 복제했어요.');
                          navigate(`/admin/rooms/${room.id}/edit`);
                        },
                        onError: (err) => toast.error(errorText(err)),
                      })
                    }
                  >
                    <Copy className="size-5" />
                  </IconButton>
                  {(r.status === 'DRAFT' || r.status === 'ENDED') && (
                    <IconButton label="삭제" className="hover:text-danger-text" onClick={() => setToDelete(r)}>
                      <Trash2 className="size-5" />
                    </IconButton>
                  )}
                </div>
              </m.li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`'${toDelete?.title ?? ''}' 퀴즈방을 삭제할까요?`}
        description="참여 기록과 결과도 함께 삭제되고 되돌릴 수 없어요."
        confirmLabel="삭제"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            toast.success('퀴즈방을 삭제했어요.');
          } catch (err) {
            toast.error(errorText(err));
          }
        }}
      />
    </>
  );
}
