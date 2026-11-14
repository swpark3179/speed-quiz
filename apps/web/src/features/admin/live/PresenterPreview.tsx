import { useState } from 'react';
import { ChevronDown, MonitorPlay } from 'lucide-react';
import { Card } from '@/ui/display';
import { cn } from '@/lib/format';

/**
 * Optional miniature of the presenter screen (same page in an iframe; it scales itself to the frame).
 * Collapsed by default: the host's phone is a remote control and the real presenter PC is the big screen,
 * so the iframe (a second live socket + full scene rendering) is only loaded when asked for.
 */
export function PresenterPreview({ roomId, onOpen }: { roomId: number; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-9 items-center gap-1.5 text-sm font-bold text-fg-muted"
        >
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          진행 화면(PC) 미리보기 {open ? '접기' : '펼치기'}
        </button>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 text-sm font-bold text-info hover:underline">
          <MonitorPlay className="size-4" /> 새 창으로 열기
        </button>
      </div>
      {open && (
        <div className="relative aspect-video w-full border-t border-line bg-n-200">
          <iframe
            src={`/screen/${roomId}`}
            title="진행 화면 미리보기"
            className="pointer-events-none absolute inset-0 size-full border-0"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      )}
    </Card>
  );
}
