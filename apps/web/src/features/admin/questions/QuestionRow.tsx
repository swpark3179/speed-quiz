import { Link, useNavigate } from 'react-router';
import { m } from 'motion/react';
import { Copy, Eye, Globe, Image as ImageIcon, Lock, Pencil, Timer, Trash2 } from 'lucide-react';
import type { QuestionListItem } from '@sq/shared';
import { cappedStagger, spring } from '@/design/motion';
import { cn, dateTime } from '@/lib/format';
import { IconButton } from '@/ui/Button';
import { Badge } from '@/ui/display';
import { KindBadge } from '../components/common';

/** Shared column template for the bank's header row and question rows (lg+). */
export const ROW_COLS = 'lg:grid-cols-[28px_168px_1fr_80px_90px_150px_140px]';

export function QuestionListHeader({
  allSelected,
  onSelectAll,
  selectable,
}: {
  allSelected: boolean;
  onSelectAll: (v: boolean) => void;
  selectable: boolean;
}) {
  return (
    <div className={cn('hidden items-center gap-4 px-5 pb-2 text-xs font-bold text-fg-muted lg:grid', ROW_COLS)}>
      <span className="flex">
        {selectable && (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onSelectAll(e.target.checked)}
            aria-label="이 페이지의 내 문제 모두 선택"
            className="size-4.5 cursor-pointer accent-[#17153B]"
          />
        )}
      </span>
      <span>유형</span>
      <span>문제</span>
      <span className="text-center">보기</span>
      <span className="text-center">제한시간</span>
      <span>수정일</span>
      <span className="text-right">관리</span>
    </div>
  );
}

export function QuestionRow({
  item,
  index,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  duplicating,
  showGroup,
}: {
  item: QuestionListItem;
  index: number;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicating?: boolean;
  /** show the group name (e.g. in search results) */
  showGroup?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <m.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay: cappedStagger(index) }}
      className={cn(
        'group relative rounded-lg bg-surface shadow-xs ring-1 transition-shadow hover:shadow-md',
        selected ? 'ring-2 ring-spark-500' : 'ring-line/60',
      )}
    >
      <div className={cn('grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-4 lg:gap-4 lg:px-5', ROW_COLS)}>
        {/* top-right corner on phones, first column on desktop */}
        <span className="absolute top-3 right-3 z-10 flex lg:static">
          {item.mine && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
              aria-label={`${item.title || item.preview || '문제'} 선택`}
              className="size-6 cursor-pointer accent-[#17153B] lg:size-4.5"
            />
          )}
        </span>
        <div className="col-span-2 flex items-center gap-2 pr-8 lg:col-span-1 lg:pr-0">
          <KindBadge kind={item.kind} />
          {item.isPublic ? (
            <Badge tone="info" className="gap-1">
              <Globe className="size-3" aria-hidden="true" /> 공개
            </Badge>
          ) : (
            <Badge tone="neutral" className="gap-1">
              <Lock className="size-3" aria-hidden="true" /> 비공개
            </Badge>
          )}
          {item.hasImage && <ImageIcon className="size-4 text-n-400" aria-label="이미지 포함" />}
        </div>
        <Link to={`/admin/questions/${item.id}`} className="col-span-2 min-w-0 lg:col-span-1 after:absolute after:inset-0 after:content-['']">
          <p className="truncate font-bold">{item.title || item.preview || '(내용 없음)'}</p>
          {item.title && <p className="truncate text-sm text-fg-muted">{item.preview}</p>}
          {!item.mine && <p className="truncate text-xs font-semibold text-fg-muted">작성자 {item.ownerName ?? '알 수 없음'} · 읽기 전용</p>}
          {(item.tags.length > 0 || (showGroup && item.groupName)) && (
            <p className="mt-1 flex flex-wrap gap-1">
              {showGroup && item.groupName && (
                <span className="rounded-full bg-spark-50 px-2 py-0.5 text-xs font-bold text-spark-700">{item.groupName}</span>
              )}
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
          <IconButton label={item.mine ? '수정' : '보기'} onClick={() => navigate(`/admin/questions/${item.id}`)}>
            {item.mine ? <Pencil className="size-5" /> : <Eye className="size-5" />}
          </IconButton>
          <IconButton label="복제" disabled={duplicating} onClick={onDuplicate}>
            <Copy className="size-5" />
          </IconButton>
          {item.mine && (
            <IconButton label="삭제" className="hover:text-danger-text" onClick={onDelete}>
              <Trash2 className="size-5" />
            </IconButton>
          )}
        </div>
      </div>
    </m.li>
  );
}
