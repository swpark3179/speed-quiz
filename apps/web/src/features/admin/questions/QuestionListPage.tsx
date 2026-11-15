import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { FolderInput, FolderMinus, FolderPlus, LibraryBig, Plus, Search, X } from 'lucide-react';
import type { QuestionGroupDto, QuestionKind, QuestionListItem } from '@sq/shared';
import { errorText } from '@/lib/api';
import { cn } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/dom';
import { Button } from '@/ui/Button';
import { EmptyState, Spinner } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import { Segmented } from '@/ui/fields';
import { useDeleteQuestion, useDuplicateQuestion, useGroupVisibility, useMoveQuestions, useQuestionGroups, useQuestionList } from '../api';
import { PageHeader } from '../components/common';
import { DeleteGroupDialog, GroupNameDialog, GroupRow, MoveToGroupDialog, type RowActions } from './groups';
import { QuestionListHeader, QuestionRow } from './QuestionRow';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'ALL' | QuestionKind>('ALL');
  const [tag, setTag] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'mine' | 'public'>('all');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());
  useEffect(() => setPage(1), [q, kind, tag, scope]);

  const filters = { q: q || undefined, kind: kind === 'ALL' ? undefined : kind, tag: tag ?? undefined, scope };
  const filtering = !!q || kind !== 'ALL' || !!tag;
  const list = useQuestionList({ ...filters, ungrouped: true, page, pageSize: PAGE_SIZE });
  const groups = useQuestionGroups(filters);
  const del = useDeleteQuestion();
  const dup = useDuplicateQuestion();
  const move = useMoveQuestions();
  const visibility = useGroupVisibility();
  const [toDelete, setToDelete] = useState<QuestionListItem | null>(null);

  /* groups: open state (?group=<id> opens one, e.g. when coming back from the editor). While searching, groups start open. */
  const [toggled, setToggled] = useState<Set<number>>(() => {
    const g = Number(searchParams.get('group'));
    return new Set(Number.isInteger(g) && g > 0 ? [g] : []);
  });
  const searching = !!q;
  const wasSearching = useRef(searching);
  useEffect(() => {
    if (wasSearching.current === searching) return;
    wasSearching.current = searching;
    setToggled(new Set());
  }, [searching]);
  useEffect(() => {
    if (searchParams.has('group')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const isOpen = (id: number) => searching !== toggled.has(id);
  const toggle = (id: number) =>
    setToggled((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const [groupDialog, setGroupDialog] = useState<{ group: QuestionGroupDto | null } | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<QuestionGroupDto | null>(null);
  const [toPublic, setToPublic] = useState<QuestionGroupDto | null>(null);

  /* selection (my questions only): id → its current group */
  const [selected, setSelected] = useState<Map<number, number | null>>(new Map());
  const [moveOpen, setMoveOpen] = useState(false);
  const select = (item: QuestionListItem, v: boolean) =>
    setSelected((s) => {
      const n = new Map(s);
      if (v) n.set(item.id, item.groupId);
      else n.delete(item.id);
      return n;
    });
  const selectedGroups = new Set(selected.values());
  const anyGrouped = [...selectedGroups].some((g) => g !== null);

  const rowActions: RowActions = {
    isSelected: (id) => selected.has(id),
    onSelect: select,
    duplicating: dup.isPending,
    onDuplicate: (item) =>
      dup.mutate(item.id, {
        onSuccess: (copy) =>
          toast.success(item.mine ? (copy.groupName ? `복제해서 '${copy.groupName}' 그룹 맨 뒤에 넣었어요.` : '문제를 복제했어요.') : '내 문제로 복제했어요. (비공개)'),
        onError: (err) => toast.error(errorText(err)),
      }),
    onDelete: setToDelete,
  };

  const moveSelected = async (groupId: number | null, name?: string) => {
    const ids = [...selected.keys()];
    const r = await move.mutateAsync({ questionIds: ids, groupId });
    toast.success(groupId === null ? `문제 ${r.moved}개를 그룹에서 뺐어요.` : `문제 ${r.moved}개를 '${name}' 그룹으로 옮겼어요.`);
    setSelected(new Map());
    if (groupId !== null && !isOpen(groupId)) toggle(groupId);
  };

  const data = list.data;
  const groupList = groups.data ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const ungroupedTotal = data?.total ?? 0;
  const groupedTotal = groupList.reduce((n, g) => n + (filtering ? g.matchCount : g.questionCount), 0);
  const pageMine = (data?.items ?? []).filter((i) => i.mine);
  const pageAllSelected = pageMine.length > 0 && pageMine.every((i) => selected.has(i.id));
  const loading = list.isPending || groups.isPending;
  const empty = !loading && data && ungroupedTotal === 0 && groupList.length === 0;

  return (
    <>
      <PageHeader
        title="문제은행"
        description={
          data && groups.data
            ? `문제 ${(ungroupedTotal + groupedTotal).toLocaleString('ko-KR')}개 · 그룹 ${groupList.length.toLocaleString('ko-KR')}개`
            : '퀴즈방에서 사용할 문제를 미리 만들어 두세요.'
        }
        actions={
          <>
            <Button variant="secondary" icon={<FolderPlus className="size-5" />} onClick={() => setGroupDialog({ group: null })}>
              새 그룹
            </Button>
            <Button icon={<Plus className="size-5" />} onClick={() => navigate('/admin/questions/new')}>
              새 문제
            </Button>
          </>
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
            placeholder="제목, 내용, 그룹 이름으로 검색"
            className="h-12 w-full rounded-md border-2 border-n-400/70 bg-surface pr-4 pl-12 outline-none focus:border-info focus:ring-4 focus:ring-info/15"
          />
        </label>
        <Segmented
          label="작성자 범위"
          className="shrink-0 [&_button]:whitespace-nowrap"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: '전체' },
            { value: 'mine', label: '내 문제' },
            { value: 'public', label: '공개 문제' },
          ]}
        />
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

      {loading ? (
        <div className="flex justify-center py-20 text-n-400">
          <Spinner className="size-8" />
        </div>
      ) : list.isError || groups.isError ? (
        <EmptyState title="문제 목록을 불러오지 못했어요">{errorText(list.error ?? groups.error)}</EmptyState>
      ) : empty ? (
        <EmptyState icon={<LibraryBig className="size-12" />} title={filtering || scope !== 'all' ? '조건에 맞는 문제가 없어요' : '아직 문제가 없어요'}>
          {filtering || scope !== 'all' ? (
            '검색어나 필터를 바꿔 보세요.'
          ) : (
            <Button className="mt-2" icon={<Plus className="size-5" />} onClick={() => navigate('/admin/questions/new')}>
              첫 문제 만들기
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className={cn('flex flex-col gap-8 transition-opacity', (list.isFetching || groups.isFetching) && 'opacity-80')}>
          {groupList.length > 0 && (
            <section aria-labelledby="groups-heading">
              <h2 id="groups-heading" className="mb-2.5 px-1 text-sm font-extrabold text-fg-muted">
                그룹 <span className="tabular">{groupList.length}</span>
              </h2>
              <ul className="flex flex-col gap-2.5">
                {groupList.map((g) => (
                  <GroupRow
                    key={g.id}
                    group={g}
                    open={isOpen(g.id)}
                    onToggle={() => toggle(g.id)}
                    filters={filters}
                    filtering={filtering}
                    rowActions={rowActions}
                    onRename={() => setGroupDialog({ group: g })}
                    onDeleteGroup={() => setGroupToDelete(g)}
                    onVisibility={(isPublic) => {
                      if (isPublic) setToPublic(g);
                      else
                        visibility.mutate(
                          { id: g.id, isPublic: false },
                          {
                            onSuccess: (r) => toast.success(`문제 ${r.changed}개를 비공개로 바꿨어요.`),
                            onError: (err) => toast.error(errorText(err)),
                          },
                        );
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          {ungroupedTotal > 0 && (
            <section aria-labelledby="ungrouped-heading">
              {groupList.length > 0 && (
                <h2 id="ungrouped-heading" className="mb-2.5 px-1 text-sm font-extrabold text-fg-muted">
                  그룹 없는 문제 <span className="tabular">{ungroupedTotal.toLocaleString('ko-KR')}</span>
                </h2>
              )}
              <QuestionListHeader
                selectable={pageMine.length > 0}
                allSelected={pageAllSelected}
                onSelectAll={(v) => pageMine.forEach((i) => select(i, v))}
              />
              <ul className="flex flex-col gap-2.5">
                {data?.items.map((item, i) => (
                  <QuestionRow
                    key={item.id}
                    item={item}
                    index={i}
                    selected={selected.has(item.id)}
                    onSelect={(v) => select(item, v)}
                    onDuplicate={() => rowActions.onDuplicate(item)}
                    onDelete={() => setToDelete(item)}
                    duplicating={dup.isPending}
                  />
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
            </section>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="선택한 문제"
          className="sticky bottom-20 z-(--z-raised) mt-6 flex flex-wrap items-center gap-2 rounded-lg bg-ink p-2 pl-4 text-white shadow-lg md:bottom-4"
        >
          <span className="tabular mr-auto font-bold">{selected.size}개 선택</span>
          <Button size="sm" variant="primary" icon={<FolderInput className="size-4" />} onClick={() => setMoveOpen(true)}>
            그룹으로 이동
          </Button>
          {anyGrouped && (
            <Button
              size="sm"
              variant="subtle"
              icon={<FolderMinus className="size-4" />}
              loading={move.isPending}
              onClick={() => moveSelected(null).catch((err) => toast.error(errorText(err)))}
            >
              그룹에서 빼기
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Map())}
            className="inline-flex h-9 items-center gap-1 rounded-sm px-3 text-sm font-bold text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" aria-hidden="true" /> 선택 해제
          </button>
        </div>
      )}

      <MoveToGroupDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        count={selected.size}
        currentGroupId={selectedGroups.size === 1 ? [...selectedGroups][0]! : null}
        onMove={({ groupId, name }) => moveSelected(groupId, name)}
      />
      <GroupNameDialog
        open={!!groupDialog}
        onOpenChange={(v) => !v && setGroupDialog(null)}
        group={groupDialog?.group ?? null}
        onSaved={(g) => {
          if (!groupDialog?.group && !isOpen(g.id)) toggle(g.id);
        }}
      />
      <DeleteGroupDialog
        group={groupToDelete}
        onOpenChange={(v) => !v && setGroupToDelete(null)}
        onDeleted={(questionsDeleted) => {
          // drop selections that pointed at the deleted group (its questions are gone or ungrouped now)
          const gid = groupToDelete?.id;
          setSelected((s) => new Map([...s].filter(([, g]) => g !== gid || !questionsDeleted).map(([id, g]) => [id, g === gid ? null : g])));
        }}
      />
      <ConfirmDialog
        open={!!toPublic}
        onOpenChange={(v) => !v && setToPublic(null)}
        title="그룹 문제를 모두 공개할까요?"
        description={`'${toPublic?.name ?? ''}' 그룹의 비공개 문제 ${toPublic ? toPublic.questionCount - toPublic.publicCount : 0}개가 공개돼요. 다른 관리자가 보고 퀴즈방에 쓸 수 있지만 수정은 나만 할 수 있어요.`}
        confirmLabel="모두 공개"
        onConfirm={async () => {
          if (!toPublic) return;
          try {
            const r = await visibility.mutateAsync({ id: toPublic.id, isPublic: true });
            toast.success(`문제 ${r.changed}개를 공개로 바꿨어요.`);
          } catch (err) {
            toast.error(errorText(err));
          }
        }}
      />
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
            select(toDelete, false);
            toast.success('문제를 삭제했어요.');
          } catch (err) {
            toast.error(errorText(err));
          }
        }}
      />
    </>
  );
}
