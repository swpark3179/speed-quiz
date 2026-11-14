import { MonitorPlay } from 'lucide-react';
import { Card } from '@/ui/display';

/** Live miniature of the presenter screen (same page in an iframe; it scales itself to the frame). */
export function PresenterPreview({ roomId, onOpen }: { roomId: number; onOpen: () => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-sm font-bold text-fg-muted">진행 화면 미리보기</p>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 text-sm font-bold text-info hover:underline">
          <MonitorPlay className="size-4" /> 새 창으로 열기
        </button>
      </div>
      <div className="relative aspect-video w-full bg-n-200">
        <iframe
          src={`/screen/${roomId}`}
          title="진행 화면 미리보기"
          className="pointer-events-none absolute inset-0 size-full border-0"
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    </Card>
  );
}
