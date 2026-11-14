import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Check, GripVertical, Plus, Search, X } from 'lucide-react';
import type { QuestionKind, RoomDraftItemDto } from '@sq/shared';
import { cappedStagger, spring } from '@/design/motion';
import { cn } from '@/lib/format';
import { IconButton } from '@/ui/Button';
import { EmptyState, Spinner } from '@/ui/display';
import { Segmented } from '@/ui/fields';
import { useQuestionList } from '../api';
import { KindBadge } from '../components/common';

export type QuestionBrief = NonNullable<RoomDraftItemDto['question']>;

export interface SelectedItem {
  key: string;
  questionId: number;
  timeLimitSec: number | null;
  multiplier: number;
  question: QuestionBrief | null;
}

const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const MULTIPLIERS = [0.5, 1, 1.5, 2, 3];

let seq = 0;
export const itemKey = () => `it-${++seq}`;

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function BankPane({ selectedIds, onToggle }: { selectedIds: Set<number>; onToggle: (q: QuestionBrief) => void }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'ALL' | QuestionKind>('ALL');
  const q = useDebounced(search.trim());
  const list = useQuestionList({ q: q || undefined, kind: kind === 'ALL' ? undefined : kind, pageSize: 200 });

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">문제 검색</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-n-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="문제 검색"
            className="h-12 w-full rounded-md border-2 border-n-400/70 bg-surface pr-3 pl-10 outline-none focus:border-info focus:ring-4 focus:ring-info/15"
          />
        </label>
        <Segmented
          label="문제 유형"
          className="shrink-0 [&_button]:whitespace-nowrap [&_button]:px-3"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: '전체' },
            { value: 'TEXT', label: '텍스트' },
            { value: 'HTML', label: 'HTML' },
          ]}
        />
      </div>
      {list.isPending ? (
        <div className="flex justify-center py-12 text-n-400">
          <Spinner className="size-7" />
        </div>
      ) : !list.data || list.data.items.length === 0 ? (
        <EmptyState title={q || kind !== 'ALL' ? '조건에 맞는 문제가 없어요' : '문제은행이 비어 있어요'}>
          <Link to="/admin/questions/new" className="font-bold text-info underline">
            새 문제 만들기
          </Link>
        </EmptyState>
      ) : (
        <ul className="-mx-1 flex max-h-[min(60vh,640px)] flex-col gap-2 overflow-y-auto p-1 scrollbar-thin">
          {list.data.items.map((item, i) => {
            const on = selectedIds.has(item.id);
            return (
              <m.li key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: cappedStagger(i) }}>
                <button
                  type="button"
                  onClick={() =>
                    onToggle({
                      id: item.id,
                      kind: item.kind,
                      title: item.title,
                      preview: item.preview,
                      choiceCount: item.choiceCount,
                      timeLimitSec: item.timeLimitSec,
                    })
                  }
                  aria-pressed={on}
                  className={cn(
                    'flex min-h-16 w-full items-center gap-3 rounded-md p-3 text-left ring-2 transition-colors',
                    on ? 'bg-spark-50 ring-spark-500' : 'bg-surface ring-line/70 hover:ring-n-400',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors',
                      on ? 'bg-ink text-spark-400' : 'bg-n-100 text-n-400',
                    )}
                    aria-hidden="true"
                  >
                    {on ? <Check className="size-5" strokeWidth={3} /> : <Plus className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <KindBadge kind={item.kind} />
                      <span className="truncate font-bold">{item.title || item.preview}</span>
                      {!item.mine && (
                        <span className="shrink-0 rounded-full bg-info-tint px-2 py-0.5 text-xs font-bold text-info-dark">
                          {item.ownerName ?? '공개'} 님
                        </span>
                      )}
                    </span>
                    {item.title && <span className="mt-0.5 block truncate text-sm text-fg-muted">{item.preview}</span>}
                  </span>
                  <span className="hidden shrink-0 text-xs font-semibold text-fg-muted sm:block">보기 {item.choiceCount}</span>
                </button>
              </m.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SortableRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: SelectedItem;
  index: number;
  onChange: (patch: Partial<SelectedItem>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col gap-2 rounded-md bg-surface p-3 ring-2',
        isDragging ? 'z-10 shadow-lg ring-info' : item.question ? 'ring-line/70' : 'ring-danger',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xs text-n-400 hover:bg-n-100 active:cursor-grabbing"
          aria-label={`${index + 1}번 문제 순서 바꾸기`}
        >
          <GripVertical className="size-5" />
        </button>
        <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{index + 1}</span>
        {item.question ? (
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <KindBadge kind={item.question.kind} />
              <span className="truncate font-bold">{item.question.title || item.question.preview}</span>
            </span>
          </span>
        ) : (
          <span className="flex flex-1 items-center gap-1.5 text-sm font-bold text-danger-text">
            <AlertTriangle className="size-4" /> 삭제된 문제예요. 목록에서 빼 주세요.
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-[4.5rem]">
        <select
          aria-label={`${index + 1}번 제한시간`}
          value={item.timeLimitSec ?? ''}
          onChange={(e) => onChange({ timeLimitSec: e.target.value ? Number(e.target.value) : null })}
          className="h-11 rounded-sm border-2 border-n-300 bg-surface px-2 text-sm font-semibold"
        >
          <option value="">{item.question?.timeLimitSec ? `문제 설정(${item.question.timeLimitSec}초)` : '기본 시간'}</option>
          {TIME_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}초
            </option>
          ))}
        </select>
        <select
          aria-label={`${index + 1}번 점수 배수`}
          value={item.multiplier}
          onChange={(e) => onChange({ multiplier: Number(e.target.value) })}
          className={cn(
            'h-11 rounded-sm border-2 bg-surface px-2 text-sm font-bold',
            item.multiplier !== 1 ? 'border-spark-500 text-spark-700' : 'border-n-300',
          )}
        >
          {MULTIPLIERS.map((x) => (
            <option key={x} value={x}>
              점수 ×{x}
            </option>
          ))}
        </select>
        <IconButton label={`${index + 1}번 문제 빼기`} onClick={onRemove} className="ml-auto hover:text-danger-text">
          <X className="size-5" />
        </IconButton>
      </div>
    </li>
  );
}

function SelectedPane({ items, onItems }: { items: SelectedItem[]; onItems: (i: SelectedItem[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.key === active.id);
    const to = items.findIndex((i) => i.key === over.id);
    onItems(arrayMove(items, from, to));
  };
  if (items.length === 0) {
    return (
      <EmptyState title="선택한 문제가 없어요">
        <span>문제은행에서 이번 퀴즈에 쓸 문제를 골라 주세요.</span>
      </EmptyState>
    );
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <SortableRow
              key={item.key}
              item={item}
              index={i}
              onChange={(p) => onItems(items.map((x) => (x.key === item.key ? { ...x, ...p } : x)))}
              onRemove={() => onItems(items.filter((x) => x.key !== item.key))}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export function QuestionPickerStep({ items, onItems }: { items: SelectedItem[]; onItems: (i: SelectedItem[]) => void }) {
  const [tab, setTab] = useState<'bank' | 'selected'>('bank');
  const selectedIds = new Set(items.map((i) => i.questionId));
  const toggle = (q: QuestionBrief) => {
    if (selectedIds.has(q.id)) onItems(items.filter((i) => i.questionId !== q.id));
    else onItems([...items, { key: itemKey(), questionId: q.id, timeLimitSec: null, multiplier: 1, question: q }]);
  };

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="문제 선택 화면"
        className="w-full lg:hidden"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bank', label: '문제은행' },
          {
            value: 'selected',
            label: (
              <>
                선택됨
                <AnimatePresence mode="popLayout" initial={false}>
                  <m.span
                    key={items.length}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring.pop}
                    className="tabular rounded-full bg-ink px-2 text-xs text-white"
                  >
                    {items.length}
                  </m.span>
                </AnimatePresence>
              </>
            ),
          },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cn('rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line/60 md:p-5', tab !== 'bank' && 'hidden lg:block')}>
          <h2 className="mb-3 text-lg font-extrabold">문제은행</h2>
          <BankPane selectedIds={selectedIds} onToggle={toggle} />
        </section>
        <section className={cn('rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line/60 md:p-5', tab !== 'selected' && 'hidden lg:block')}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-extrabold">
              이번 퀴즈 문제 <span className="tabular text-spark-700">{items.length}개</span>
            </h2>
            <span className="text-xs font-semibold text-fg-muted">끌어서 순서를 바꿀 수 있어요</span>
          </div>
          <SelectedPane items={items} onItems={onItems} />
        </section>
      </div>
    </div>
  );
}
