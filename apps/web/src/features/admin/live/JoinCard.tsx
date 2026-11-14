import { Copy, MonitorPlay } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminSnapshot } from '@sq/shared';
import { JoinQR } from '@/game/effects';
import { Card } from '@/ui/display';

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label}를 복사했어요`);
  } catch {
    window.prompt(`${label}를 복사하세요`, text);
  }
}

export function JoinCard({ snap }: { snap: AdminSnapshot }) {
  const { joinUrl, presenterUrl, code } = snap.room;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <JoinQR url={joinUrl} size={104} className="shrink-0 p-1.5 shadow-none ring-1 ring-line" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-fg-muted">방 코드</p>
          <p className="tabular text-3xl leading-tight font-black tracking-wider">
            {code.slice(0, 3)} {code.slice(3)}
          </p>
          <button
            type="button"
            onClick={() => copy(joinUrl, '참여 주소')}
            className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-info hover:underline"
            title={joinUrl}
          >
            <Copy className="size-4 shrink-0" />
            <span className="truncate">{joinUrl.replace(/^https?:\/\//, '')}</span>
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => copy(presenterUrl, '진행 화면 주소')}
        className="mt-4 flex w-full items-center gap-2 rounded-md bg-n-50 px-3 py-2.5 text-left text-sm font-semibold ring-1 ring-line/60 hover:bg-n-100"
      >
        <MonitorPlay className="size-4 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">다른 PC에서 진행 화면 열기</span>
          <span className="block text-xs text-fg-muted">로그인 없이 열 수 있는 진행 화면 주소를 복사해요</span>
        </span>
        <Copy className="size-4 shrink-0 text-info" />
      </button>
    </Card>
  );
}
