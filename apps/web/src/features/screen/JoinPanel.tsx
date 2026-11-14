import { JoinQR, MarqueeBorder } from '@/game/effects';
import { cn } from '@/lib/format';
import { formatCode, shortUrl } from './hooks';

/** "How to join" block: URL + marquee room code + QR. Used in the lobby and the JOIN_QR overlay. */
export function JoinPanel({ joinUrl, code, className, compact }: { joinUrl: string; code: string; className?: string; compact?: boolean }) {
  const base = joinUrl.replace(/\/join\/\d+$/, '/join');
  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      <h2 className="font-display text-[3rem] leading-none">참여 방법</h2>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[1.75rem] font-bold text-fg-muted">휴대폰으로 QR 코드를 찍거나 주소로 접속하세요</p>
        <p className="tabular rounded-full bg-surface px-6 py-2 text-[2.25rem] font-extrabold shadow-sm ring-1 ring-line">
          {shortUrl(base)}
        </p>
      </div>
      <div className={cn('flex items-center gap-8', compact ? 'flex-row' : 'flex-col')}>
        <MarqueeBorder bulbs={18} className="text-white">
          <p className="text-center text-[1.5rem] font-bold text-spark-200">방 코드</p>
          <p className="tabular text-center text-[8.5rem] leading-[1.05] font-black tracking-[0.06em] text-white">{formatCode(code)}</p>
        </MarqueeBorder>
        <JoinQR url={joinUrl} size={compact ? '18rem' : '20rem'} />
      </div>
    </div>
  );
}
