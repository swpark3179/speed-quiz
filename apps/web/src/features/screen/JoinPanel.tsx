import { JoinQR, MarqueeBorder } from '@/game/effects';
import { cn } from '@/lib/format';
import { formatCode, shortUrl } from './hooks';

/** "How to join" block: URL + marquee room code + QR. Used in the lobby and the JOIN_QR overlay. */
export function JoinPanel({ joinUrl, code, className, compact }: { joinUrl: string; code: string; className?: string; compact?: boolean }) {
  const base = joinUrl.replace(/\/join\/\d+$/, '/join');
  return (
    <div className={cn('flex flex-col items-center gap-5', className)}>
      <h2 className="font-display text-[3rem] leading-none">참여 방법</h2>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[1.6rem] font-bold text-fg-muted">휴대폰으로 QR 코드를 찍거나 주소로 접속하세요</p>
        <p className="tabular rounded-full bg-surface px-6 py-1.5 text-[2.1rem] font-extrabold whitespace-nowrap shadow-sm ring-1 ring-line">
          {shortUrl(base)}
        </p>
      </div>
      <div className={cn('flex items-center', compact ? 'flex-row gap-8' : 'flex-col gap-5')}>
        <MarqueeBorder bulbs={18} className="px-[3.5rem] py-[2.25rem] text-white">
          <p className="text-center text-[1.5rem] font-bold text-spark-200">방 코드</p>
          <p className="tabular text-center text-[7rem] leading-[1.05] font-black tracking-[0.05em] whitespace-nowrap text-white">
            {formatCode(code)}
          </p>
        </MarqueeBorder>
        <JoinQR url={joinUrl} size={compact ? '16rem' : '15.5rem'} />
      </div>
    </div>
  );
}
