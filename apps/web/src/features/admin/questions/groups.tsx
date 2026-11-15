import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { DropdownMenu } from 'radix-ui';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Globe,
  GripVertical,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { QuestionFilters, QuestionGroupDto, QuestionListItem } from '@sq/shared';
import { errorText } from '@/lib/api';
import { cn } from '@/lib/format';
import { Button, IconButton } from '@/ui/Button';
import { Spinner } from '@/ui/display';
import { Modal } from '@/ui/Dialog';
import { Checkbox, TextField } from '@/ui/fields';
import { questionListQuery, useDeleteGroup, useQuestionGroups, useQuestionList, useReorderGroup, useSaveGroup } from '../api';
import { KindBadge } from '../components/common';
import { QuestionRow } from './QuestionRow';

const menuItem =
  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-bold outline-none select-none data-[highlighted]:bg-n-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40';

/** Folder tile used for groups in the bank and in the room's question picker. */
export function GroupIcon({ open, className }: { open?: boolean; className?: string }) {
  const Icon = open ? FolderOpen : Folder;
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-md bg-spark-50 text-spark-700', className)} aria-hidden="true">
      <Icon className="size-5" />
    </span>
  );
}

/** "문제 12개 · 공개 3개" (or the match count while filtering). */
export function groupCountText(g: QuestionGroupDto, filtering: boolean): string {
  if (filtering) return `일치 ${g.matchCount}개 / 전체 ${g.questionCount}개`;
  if (!g.mine || g.questionCount === 0) return `문제 ${g.questionCount}개`;
  return `문제 ${g.questionCount}개 · 공개 ${g.publicCount}개`;
}

/* ------------------------------------------------------------------ */
/* Group row (bank)                                                    */
/* ------------------------------------------------------------------ */

export interface RowActions {
  isSelected: (id: number) => boolean;
  onSelect: (item: QuestionListItem, v: boolean) => void;
  onDuplicate: (item: QuestionListItem) => void;
  onDelete: (item: QuestionListItem) => void;
  duplicating: boolean;
}

export function GroupRow({
  group,
  open,
  onToggle,
  filters,
  filtering,
  rowActions,
  onRename,
  onDeleteGroup,
  onVisibility,
}: {
  group: QuestionGroupDto;
  open: boolean;
  onToggle: () => void;
  filters: QuestionFilters;
  filtering: boolean;
  rowActions: RowActions;
  onRename: () => void;
  onDeleteGroup: () => void;
  onVisibility: (isPublic: boolean) => void;
}) {
  const navigate = useNavigate();
  const bodyId = `group-${group.id}-questions`;
  return (
    <li className={cn('rounded-lg bg-surface shadow-xs ring-1 transition-shadow', open ? 'shadow-md ring-n-300' : 'ring-line/60 hover:shadow-md')}>
      <div className="flex items-center gap-2 p-2 pr-3 lg:pl-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-info"
        >
          <ChevronRight className={cn('size-5 shrink-0 text-n-400 transition-transform', open && 'rotate-90')} aria-hidden="true" />
          <GroupIcon open={open} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{group.name}</span>
            <span className="tabular block truncate text-sm font-semibold text-fg-muted">
              {groupCountText(group, filtering)}
              {!group.mine && ` · 작성자 ${group.ownerName ?? '알 수 없음'} · 읽기 전용`}
            </span>
          </span>
        </button>
        {group.mine && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <IconButton label={`${group.name} 그룹 메뉴`}>
                <MoreHorizontal className="size-5" />
              </IconButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-(--z-dropdown) min-w-52 rounded-md bg-surface p-1.5 shadow-lg ring-1 ring-line data-[state=open]:animate-overlay-in"
              >
                <DropdownMenu.Item className={menuItem} onSelect={() => navigate(`/admin/questions/new?group=${group.id}`)}>
                  <Plus className="size-4" /> 이 그룹에 새 문제
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={onRename}>
                  <Pencil className="size-4" /> 이름 바꾸기
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item
                  className={menuItem}
                  disabled={group.questionCount === 0 || group.publicCount === group.questionCount}
                  onSelect={() => onVisibility(true)}
                >
                  <Globe className="size-4" /> 그룹 문제 모두 공개
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} disabled={group.publicCount === 0} onSelect={() => onVisibility(false)}>
                  <Lock className="size-4" /> 그룹 문제 모두 비공개
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item className={cn(menuItem, 'text-danger-text')} onSelect={onDeleteGroup}>
                  <Trash2 className="size-4" /> 그룹 삭제
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
      {open && (
        <div id={bodyId} className="rounded-b-lg border-t border-line/70 bg-n-25 p-3 lg:p-4">
          <GroupBody group={group} filters={filters} filtering={filtering} rowActions={rowActions} />
        </div>
      )}
    </li>
  );
}

function GroupBody({
  group,
  filters,
  filtering,
  rowActions,
}: {
  group: QuestionGroupDto;
  filters: QuestionFilters;
  filtering: boolean;
  rowActions: RowActions;
}) {
  const navigate = useNavigate();
  const [reordering, setReordering] = useState(false);
  const params = { ...filters, groupId: group.id, pageSize: 200 };
  const list = useQuestionList(params);
  const items = list.data?.items ?? [];
  const complete = !!list.data && list.data.total === items.length;
  const canReorder = group.mine && !filtering && complete && items.length > 1;
  useEffect(() => {
    if (!canReorder) setReordering(false);
  }, [canReorder]);

  if (list.isPending) {
    return (
      <div className="flex justify-center py-6 text-n-400">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (list.isError) return <p className="py-4 text-center text-sm font-semibold text-danger-text">{errorText(list.error)}</p>;

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="rounded-md bg-surface px-4 py-6 text-center text-sm font-semibold text-fg-muted ring-1 ring-line/60">
          {filtering
            ? '이 그룹에는 조건에 맞는 문제가 없어요.'
            : group.mine
              ? '아직 문제가 없어요. 아래에서 새 문제를 만들거나, 목록에서 문제를 선택해 "그룹으로 이동"하세요.'
              : '볼 수 있는 문제가 없어요.'}
        </p>
      ) : reordering ? (
        <SortableGroupList groupId={group.id} params={params} items={items} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item, i) => (
            <QuestionRow
              key={item.id}
              item={item}
              index={i}
              selected={rowActions.isSelected(item.id)}
              onSelect={(v) => rowActions.onSelect(item, v)}
              onDuplicate={() => rowActions.onDuplicate(item)}
              onDelete={() => rowActions.onDelete(item)}
              duplicating={rowActions.duplicating}
            />
          ))}
        </ul>
      )}
      {group.mine && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {reordering ? (
            <Button size="sm" variant="ink" icon={<Check className="size-4" />} onClick={() => setReordering(false)}>
              순서 바꾸기 완료
            </Button>
          ) : (
            <>
              {canReorder && (
                <Button size="sm" variant="ghost" icon={<ArrowUpDown className="size-4" />} onClick={() => setReordering(true)}>
                  순서 바꾸기
                </Button>
              )}
              <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} onClick={() => navigate(`/admin/questions/new?group=${group.id}`)}>
                이 그룹에 새 문제
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SortableQuestion({ item, index }: { item: QuestionListItem; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex min-h-14 items-center gap-2 rounded-md bg-surface p-2 pr-3 ring-2', isDragging ? 'z-10 shadow-lg ring-info' : 'ring-line/70')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xs text-n-400 hover:bg-n-100 active:cursor-grabbing"
        aria-label={`${index + 1}번 문제 순서 바꾸기`}
      >
        <GripVertical className="size-5" />
      </button>
      <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-black text-white">{index + 1}</span>
      <KindBadge kind={item.kind} />
      <span className="min-w-0 flex-1 truncate font-bold">{item.title || item.preview || '(내용 없음)'}</span>
    </li>
  );
}

/** Drag to reorder; each drop is saved right away (optimistically). */
function SortableGroupList({ groupId, params, items }: { groupId: number; params: Parameters<typeof questionListQuery>[0]; items: QuestionListItem[] }) {
  const qc = useQueryClient();
  const reorder = useReorderGroup();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      items,
      items.findIndex((i) => i.id === active.id),
      items.findIndex((i) => i.id === over.id),
    );
    const key = questionListQuery(params).queryKey;
    qc.setQueryData(key, (old) => (old ? { ...old, items: next } : old));
    reorder.mutate({ id: groupId, questionIds: next.map((i) => i.id) }, { onError: (err) => toast.error(errorText(err)) });
  };
  return (
    <>
      <p className="text-xs font-semibold text-fg-muted">끌어서 순서를 바꾸면 바로 저장돼요. 퀴즈방에 그룹을 통째로 넣을 때 이 순서를 따라요.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <SortableQuestion key={item.id} item={item} index={i} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

/** Create (group = null) or rename a group. */
export function GroupNameDialog({
  open,
  onOpenChange,
  group,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: QuestionGroupDto | null;
  onSaved?: (g: QuestionGroupDto) => void;
}) {
  const save = useSaveGroup();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setName(group?.name ?? '');
      setError('');
    }
  }, [open, group]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('그룹 이름을 입력해 주세요.');
    try {
      const g = await save.mutateAsync({ id: group?.id ?? null, name: trimmed });
      toast.success(group ? '그룹 이름을 바꿨어요.' : `'${g.name}' 그룹을 만들었어요.`);
      onOpenChange(false);
      onSaved?.(g);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={group ? '그룹 이름 바꾸기' : '새 그룹'}
      description={group ? undefined : '비슷한 문제를 한 그룹으로 묶으면 목록이 간단해지고, 퀴즈방에 한 번에 넣을 수 있어요.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" form="group-name-form" loading={save.isPending}>
            {group ? '저장' : '만들기'}
          </Button>
        </>
      }
    >
      <form
        id="group-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="그룹 이름"
          autoFocus
          maxLength={40}
          placeholder="예) 우리 회사 역사 퀴즈"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          error={error}
          counter={`${[...name].length}/40`}
        />
      </form>
    </Modal>
  );
}

/** Pick one of my groups (or a new one) for the selected questions. */
export function MoveToGroupDialog({
  open,
  onOpenChange,
  count,
  currentGroupId,
  onMove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  /** when every selected question is already in one group, that group */
  currentGroupId: number | null;
  onMove: (target: { groupId: number; name: string }) => Promise<void>;
}) {
  const groups = useQuestionGroups({ scope: 'mine' });
  const save = useSaveGroup();
  const [target, setTarget] = useState<number | 'new' | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = groups.data ?? [];
  useEffect(() => {
    if (open) {
      setTarget(null);
      setNewName('');
      setError('');
    }
  }, [open]);
  useEffect(() => {
    if (open && target === null && groups.data) setTarget(groups.data.length === 0 ? 'new' : null);
  }, [open, target, groups.data]);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      if (target === 'new') {
        const name = newName.trim();
        if (!name) {
          setError('그룹 이름을 입력해 주세요.');
          return;
        }
        const g = await save.mutateAsync({ id: null, name });
        await onMove({ groupId: g.id, name: g.name });
      } else if (target !== null) {
        const g = mine.find((x) => x.id === target)!;
        await onMove({ groupId: g.id, name: g.name });
      }
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const option = (key: number | 'new', label: ReactNode, sub?: ReactNode, disabled?: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={target === key}
      disabled={disabled}
      onClick={() => setTarget(key)}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-md p-2 pr-3 text-left ring-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        target === key ? 'bg-spark-50 ring-spark-500' : 'bg-surface ring-line/70 hover:ring-n-400',
      )}
    >
      {key === 'new' ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-n-100 text-n-600" aria-hidden="true">
          <FolderPlus className="size-5" />
        </span>
      ) : (
        <GroupIcon />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{label}</span>
        {sub && <span className="block truncate text-sm text-fg-muted">{sub}</span>}
      </span>
      {target === key && <Check className="size-5 shrink-0 text-spark-700" strokeWidth={3} aria-hidden="true" />}
    </button>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="그룹으로 이동"
      description={`선택한 문제 ${count}개를 넣을 그룹을 고르세요. 그룹의 맨 뒤에 추가돼요.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button icon={<FolderInput className="size-5" />} loading={busy} disabled={target === null} onClick={submit}>
            이동
          </Button>
        </>
      }
    >
      {groups.isPending ? (
        <div className="flex justify-center py-8 text-n-400">
          <Spinner className="size-6" />
        </div>
      ) : (
        <div role="radiogroup" aria-label="옮길 그룹" className="flex flex-col gap-2 p-1">
          {mine.map((g) =>
            option(g.id, g.name, g.id === currentGroupId ? '지금 들어 있는 그룹' : `문제 ${g.questionCount}개`, g.id === currentGroupId),
          )}
          {option('new', '새 그룹 만들기')}
          {target === 'new' && (
            <TextField
              label="새 그룹 이름"
              autoFocus
              maxLength={40}
              placeholder="예) 우리 회사 역사 퀴즈"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              wrapperClassName="mt-1"
            />
          )}
          {error && <p className="text-sm font-semibold text-danger-text">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

export function DeleteGroupDialog({
  group,
  onOpenChange,
  onDeleted,
}: {
  group: QuestionGroupDto | null;
  onOpenChange: (v: boolean) => void;
  onDeleted?: (questionsDeleted: boolean) => void;
}) {
  const del = useDeleteGroup();
  const [withQuestions, setWithQuestions] = useState(false);
  useEffect(() => {
    if (group) setWithQuestions(false);
  }, [group]);
  return (
    <Modal
      open={!!group}
      onOpenChange={onOpenChange}
      size="sm"
      title={`'${group?.name ?? ''}' 그룹을 삭제할까요?`}
      description={withQuestions ? '그룹과 그 안의 문제가 모두 삭제돼요. 이미 확정된 퀴즈방에는 영향이 없어요.' : '그룹만 지워지고, 안에 있던 문제는 "그룹 없는 문제"로 옮겨져요.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant="danger"
            loading={del.isPending}
            onClick={async () => {
              if (!group) return;
              try {
                const r = await del.mutateAsync({ id: group.id, withQuestions });
                toast.success(r.deletedQuestions > 0 ? `그룹과 문제 ${r.deletedQuestions}개를 삭제했어요.` : '그룹을 삭제했어요.');
                onOpenChange(false);
                onDeleted?.(r.deletedQuestions > 0);
              } catch (err) {
                toast.error(errorText(err));
              }
            }}
          >
            삭제
          </Button>
        </>
      }
    >
      {group && group.questionCount > 0 ? (
        <Checkbox checked={withQuestions} onChange={setWithQuestions} label={<span className="font-bold">그룹 안의 문제 {group.questionCount}개도 함께 삭제</span>} />
      ) : null}
    </Modal>
  );
}
