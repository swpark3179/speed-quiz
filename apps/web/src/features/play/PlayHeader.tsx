import type { GameState } from '@/stores/game.reducer';
import { Avatar } from '@/ui/display';
import { CountUp } from '@/game/effects';

export function PlayHeader({ state, nickname }: { state: GameState; nickname: string }) {
  const room = state.room;
  const me = state.me;
  const inQuestion =
    room && room.currentIndex >= 0 && ['QUESTION_ACTIVE', 'QUESTION_REVEAL', 'LEADERBOARD'].includes(room.phase);
  const label =
    room?.phase === 'LOBBY'
      ? '대기실'
      : room?.phase === 'FINAL_RESULTS' || room?.phase === 'PRIZE_REVEAL'
        ? '결과 발표'
        : room?.phase === 'ENDED'
          ? '퀴즈 종료'
          : '\u00A0';
  return (
    <header className="pt-safe relative z-10 flex items-center gap-3 border-b border-line/70 bg-surface px-4 pb-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-fg-muted">{room?.title ?? '스피드 퀴즈'}</p>
        <p className="font-extrabold">
          {inQuestion ? (
            <span className="tabular">
              Q{room.currentIndex + 1}
              <span className="text-fg-muted">/{room.total}</span>
            </span>
          ) : room?.phase === 'LOBBY' ? (
            '대기실'
          ) : (
            ' '
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-full bg-n-50 py-1 pr-3 pl-1">
        <Avatar id={me?.id ?? 0} name={me?.nickname ?? nickname} size={32} />
        <span className="max-w-[7.5rem] truncate text-sm font-bold" title={me?.nickname ?? nickname}>
          {me?.nickname ?? nickname}
        </span>
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <CountUp value={me?.score ?? 0} className="text-sm font-black" />
        <span className="text-xs font-bold text-fg-muted">점</span>
      </div>
    </header>
  );
}
