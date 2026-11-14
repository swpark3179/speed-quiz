import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { m } from 'motion/react';
import { toast } from 'sonner';
import { Copy, Image as ImageIcon, LibraryBig, Pencil, Plus, Search, Timer, Trash2, X } from 'lucide-react';
import type { QuestionKind, QuestionListItem } from '@sq/shared';
import { cappedStagger, spring } from '@/design/motion';
import { errorText } from '@/lib/api';
import { cn, dateTime } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Button, IconButton } from '@/ui/Button';
import { EmptyState, Spinner } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import { Segmented } from '@/ui/fields';
import { useDeleteQuestion, useDuplicateQuestion, useQuestionList } from '../api';
import { KindBadge, PageHeader } from '../components/common';

const PAGE_SIZE = 30;

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function QuestionListPage() {
  useDocumentTitle('문제은행');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'ALL' | QuestionKind>('ALL');
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());
  useEffect(() => setPage(1), [q, kind, tag]);

  const list = useQuestionList({ q: q || undefined, kind: kind === 'ALL' ? undefined : kind, tag: tag ?? undefined, page, pageSize: PAGE_SIZE });
  const del = useDeleteQuestion();
  const dup = useDuplicateQuestion();
  const [toDelete, setToDelete] = useState<QuestionListItem | null>(null);

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtering = !!q || kind !== 'ALL' || !!tag;

  return (
    <>
      <PageHeader
        title="문제은행"
        description={data ? `문제 ${data.total.toLocaleString('ko-KR')}개` : '퀴즈방에서 사용할 문제를 미리 만들어 두세요.'}
        actions={
          <Button icon={<Plus className="size-5" />} onClick={() => navigate('/admin/questions/new')}>
            새 문제
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">문제 검색</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-n-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목이나 내용으로 검색"
            className="h-12 w-full rounded-md border-2 border-n-400/70 bg-surface pr-4 pl-12 outline-none focus:border-info focus:ring-4 focus:ring-info/15"
          />
        </label>
        <Segmented
          label="문제 유형"
          className="shrink-0 [&_button]:whitespace-nowrap"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: '전체' },
            { value: 'TEXT', label: '텍스트' },
            { value: 'HTML', label: 'HTML' },
          ]}
        />
      </div>

      {data && data.tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="태그 필터">
          {data.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? null : t)}
              aria-pressed={tag === t}
              className={cn(
                'inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-sm font-bold transition-colors',
                tag === t ? 'bg-ink text-white' : 'bg-surface text-fg-muted ring-1 ring-line hover:text-fg',
              )}
            >
              #{t}
              {tag === t && <X className="size-3.5" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}

      {list.isPending ? (
        <div className="flex justify-center py-20 text-n-400">
          <Spinner className="size-8" />
        </div>
      ) : list.isError ? (
        <EmptyState title="문제 목록을 불러오지 못했어요">{errorText(list.error)}</EmptyState>
      ) : data && data.items.length === 0 ? (
        <EmptyState icon={<LibraryBig className="size-12" />} title={filtering ? '조건에 맞는 문제가 없어요' : '아직 문제가 없어요'}>
          {filtering ? (
            '검색어나 필터를 바꿔 보세요.'
          ) : (
            <Button className="mt-2" icon={<Plus className="size-5" />} onClick={() => navigate('/admin/questions/new')}>
              첫 문제 만들기
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="hidden grid-cols-[90px_1fr_80px_90px_150px_140px] gap-4 px-5 pb-2 text-xs font-bold text-fg-muted lg:grid">
            <span>유형</span>
            <span>문제</span>
            <span className="text-center">보기</span>
            <span className="text-center">제한시간</span>
            <span>수정일</span>
            <span className="text-right">관리</span>
          </div>
          <ul className={cn('flex flex-col gap-2.5 transition-opacity', list.isFetching && 'opacity-70')}>
            {data?.items.map((item, i) => (
              <m.li
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: cappedStagger(i) }}
                className="group relative rounded-lg bg-surface shadow-xs ring-1 ring-line/60 transition-shadow hover:shadow-md"
              >
                <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-4 lg:grid-cols-[90px_1fr_80px_90px_150px_140px] lg:gap-4 lg:px-5">
                  <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
                    <KindBadge kind={item.kind} />
                    {item.hasImage && <ImageIcon className="size-4 text-n-400" aria-label="이미지 포함" />}
                  </div>
                  <Link to={`/admin/questions/${item.id}`} className="col-span-2 min-w-0 lg:col-span-1 after:absolute after:inset-0 after:content-['']">
                    <p className="truncate font-bold">{item.title || item.preview || '(내용 없음)'}</p>
                    {item.title && <p className="truncate text-sm text-fg-muted">{item.preview}</p>}
                    {item.tags.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {item.tags.map((t) => (
                          <span key={t} className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                            #{t}
                          </span>
                        ))}
                      </p>
                    )}
                  </Link>
                  <span className="tabular text-sm font-semibold text-fg-muted lg:text-center">보기 {item.choiceCount}개</span>
                  <span className="tabular inline-flex items-center gap-1 text-sm font-semibold text-fg-muted lg:justify-center">
                    <Timer className="size-4" aria-hidden="true" />
                    {item.timeLimitSec ? `${item.timeLimitSec}초` : '기본값'}
                  </span>
                  <span className="hidden text-sm text-fg-muted lg:block">{dateTime(item.updatedAt)}</span>
                  <div className="relative z-10 col-span-2 flex justify-end gap-1 border-t border-line/60 pt-2 lg:col-span-1 lg:border-0 lg:pt-0">
                    <IconButton label="수정" onClick={() => navigate(`/admin/questions/${item.id}`)}>
                      <Pencil className="size-5" />
                    </IconButton>
                    <IconButton
                      label="복제"
                      disabled={dup.isPending}
                      onClick={() =>
                        dup.mutate(item.id, {
                          onSuccess: () => toast.success('문제를 복제했어요.'),
                          onError: (err) => toast.error(errorText(err)),
                        })
                      }
                    >
                      <Copy className="size-5" />
                    </IconButton>
                    <IconButton label="삭제" className="hover:text-danger-text" onClick={() => setToDelete(item)}>
                      <Trash2 className="size-5" />
                    </IconButton>
                  </div>
                </div>
              </m.li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2" aria-label="페이지">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                이전
              </Button>
              <span className="tabular px-3 text-sm font-bold">
                {page} / {pages}
              </span>
              <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                다음
              </Button>
            </nav>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="문제를 삭제할까요?"
        description="이미 확정된 퀴즈방에는 영향이 없지만, 작성 중인 퀴즈방에서는 빠지게 돼요."
        confirmLabel="삭제"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            toast.success('문제를 삭제했어요.');
          } catch (err) {
            toast.error(errorText(err));
          }
        }}
      />
    </>
  );
}
