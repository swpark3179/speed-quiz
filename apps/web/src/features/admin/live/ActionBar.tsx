import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router';
import { DropdownMenu } from 'radix-ui';
import { BarChart3, Flag, Gift, ListOrdered, MonitorPlay, MoreHorizontal, OctagonX, Play, QrCode, RotateCcw, SkipForward, Square, Trophy } from 'lucide-react';
import { CEREMONY_TIMING, type AdminSnapshot, type ControlCommand, type ControlType, type PrimaryAction } from '@sq/shared';
import { Button } from '@/ui/Button';
import { Kbd } from '@/ui/display';
import { ConfirmDialog } from '@/ui/Dialog';
import { useHotkeys } from '@/hooks/dom';
import { useRemaining } from '@/lib/time';
import { cn } from '@/lib/format';

export function toCommand(snap: AdminSnapshot, p: PrimaryAction): ControlCommand | null {
  const roomId = snap.room.id;
  switch (p.type) {
    case 'START_QUESTION':
      return { roomId, type: 'START_QUESTION', index: p.index ?? snap.room.currentIndex + 1 };
    case 'CLOSE_QUESTION':
      return snap.current ? { roomId, type: 'CLOSE_QUESTION', roomQuestionId: snap.current.question.roomQuestionId } : null;
    case 'SHOW_LEADERBOARD':
      return { roomId, type: 'SHOW_LEADERBOARD', index: p.index ?? snap.room.currentIndex };
    case 'FINISH':
      return { roomId, type: 'FINISH' };
    case 'REVEAL_PRIZE':
      return p.rank ? { roomId, type: 'REVEAL_PRIZE', rank: p.rank } : null;
    case 'END':
      return { roomId, type: 'END' };
    case 'RESET':
      return { roomId, type: 'RESET' };
    case 'ABORT':
      return { roomId, type: 'ABORT' };
  }
}

const ICON: Partial<Record<ControlType, typeof Play>> = {
  START_QUESTION: Play,
  CLOSE_QUESTION: Square,
  SHOW_LEADERBOARD: ListOrdered,
  FINISH: Trophy,
  REVEAL_PRIZE: Gift,
  END: Flag,
};

function ProgressRing({ fraction }: { fraction: number }) {
  const C = 2 * Math.PI * 9;
  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} />
    </svg>
  );
}

const itemCls =
  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-bold outline-none select-none data-[highlighted]:bg-n-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40';

export function ActionBar({
  snap,
  send,
  pending,
  connected,
  onOpenPresenter,
}: {
  snap: AdminSnapshot;
  send: (cmd: ControlCommand) => Promise<boolean>;
  pending: boolean;
  connected: boolean;
  onOpenPresenter: () => void;
}) {
  const [confirm, setConfirm] = useState<'RESET' | 'ABORT' | 'END' | null>(null);
  const lastSent = useRef(0);
  const primary = snap.primary;
  const roomId = snap.room.id;
  const actions = snap.availableActions;

  // Keep the button locked while the previous prize reveal is still playing on the screen.
  const lastPrize = snap.prizes[snap.prizes.length - 1];
  const busyUntil = lastPrize ? lastPrize.startAt + CEREMONY_TIMING[lastPrize.kind].total : null;
  const busyLeft = useRemaining(busyUntil, 100);
  const busySpan = lastPrize ? Math.max(1, busyUntil! - lastPrize.at) : 1;
  const ceremonyBusy = !!lastPrize && busyLeft > 0 && (primary?.type === 'REVEAL_PRIZE' || primary?.type === 'END');

  const disabled = !primary || pending || !connected || ceremonyBusy;

  const firePrimary = useCallback(async () => {
    if (!primary || disabled) return;
    const now = Date.now();
    if (now - lastSent.current < 600) return;
    lastSent.current = now;
    if (primary.type === 'END') return setConfirm('END');
    const cmd = toCommand(snap, primary);
    if (cmd) await send(cmd);
  }, [primary, disabled, snap, send]);

  useHotkeys(
    useCallback(
      (e: KeyboardEvent) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        const t = e.target as HTMLElement | null;
        if (t?.closest('button, a, [role="button"], [role="menuitem"], [role="dialog"]')) return;
        e.preventDefault();
        void firePrimary();
      },
      [firePrimary],
    ),
  );

  const Icon = primary ? (ICON[primary.type] ?? Play) : Play;
  const showLb = actions.includes('SHOW_LEADERBOARD') && primary?.type !== 'SHOW_LEADERBOARD';
  const skipLb = actions.includes('START_QUESTION') && primary?.type === 'SHOW_LEADERBOARD';
  const finishInstead = actions.includes('FINISH') && primary?.type === 'SHOW_LEADERBOARD';
  const canEnd = actions.includes('END') && primary?.type !== 'END';
  const qrOn = snap.room.screenView === 'JOIN_QR';

  return (
    <div className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-line bg-surface/95 pb-safe shadow-[0_-8px_24px_rgb(23_21_59/0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col-reverse items-stretch gap-3 px-4 pt-3 md:flex-row md:items-center md:px-6">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" icon={<MonitorPlay className="size-5" />} onClick={onOpenPresenter}>
            <span className="hidden sm:inline">진행 화면 열기</span>
            <span className="sm:hidden">진행 화면</span>
          </Button>
          <Button
            variant={qrOn ? 'ink' : 'subtle'}
            size="md"
            icon={<QrCode className="size-5" />}
            aria-pressed={qrOn}
            disabled={!connected || snap.room.phase === 'ENDED'}
            onClick={() => send({ roomId, type: 'SCREEN_VIEW', view: qrOn ? 'AUTO' : 'JOIN_QR' })}
          >
            <span className="hidden sm:inline">{qrOn ? '입장 QR 끄기' : '입장 QR 띄우기'}</span>
            <span className="sm:hidden">{qrOn ? 'QR 끄기' : 'QR'}</span>
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="md" icon={<MoreHorizontal className="size-5" />} aria-label="더 보기" className="ml-auto md:ml-0">
                <span className="hidden lg:inline">더 보기</span>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="top"
                align="start"
                sideOffset={8}
                className="z-(--z-dropdown) min-w-56 rounded-md bg-surface p-1.5 shadow-lg ring-1 ring-line data-[state=open]:animate-overlay-in"
              >
                {showLb && (
                  <DropdownMenu.Item className={itemCls} onSelect={() => send({ roomId, type: 'SHOW_LEADERBOARD', index: snap.room.currentIndex })}>
                    <ListOrdered className="size-4" /> 순위 보기
                  </DropdownMenu.Item>
                )}
                {skipLb && (
                  <DropdownMenu.Item className={itemCls} onSelect={() => send({ roomId, type: 'START_QUESTION', index: snap.room.currentIndex + 1 })}>
                    <SkipForward className="size-4" /> 순위 건너뛰고 다음 문제
                  </DropdownMenu.Item>
                )}
                {finishInstead && (
                  <DropdownMenu.Item className={itemCls} onSelect={() => send({ roomId, type: 'FINISH' })}>
                    <Trophy className="size-4" /> 순위 건너뛰고 최종 결과
                  </DropdownMenu.Item>
                )}
                {canEnd && (
                  <DropdownMenu.Item className={itemCls} onSelect={() => setConfirm('END')}>
                    <Flag className="size-4" /> 시상식 마치고 종료
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item className={itemCls} disabled={!actions.includes('RESET')} onSelect={() => setConfirm('RESET')}>
                  <RotateCcw className="size-4" /> 리허설 초기화
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={cn(itemCls, 'text-danger-text')}
                  disabled={!actions.includes('ABORT')}
                  onSelect={() => setConfirm('ABORT')}
                >
                  <OctagonX className="size-4" /> 중단하고 종료
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <div className="flex items-center gap-3 md:ml-auto">
          <span className={cn('hidden items-center gap-1 text-sm text-fg-muted', snap.room.phase !== 'ENDED' && 'lg:flex')}>
            <Kbd>Space</Kbd> 다음 단계
          </span>
          {snap.room.phase === 'ENDED' ? (
            <Link
              to={`/admin/rooms/${roomId}`}
              className="group inline-flex w-full rounded-lg bg-spark-600 pt-1 md:w-auto md:min-w-[22rem]"
            >
              <span className="inline-flex h-16 w-full -translate-y-1.5 items-center justify-center gap-2 rounded-lg bg-spark-400 px-8 text-xl font-bold text-ink transition-transform group-hover:bg-spark-300 group-active:-translate-y-0.5">
                <BarChart3 className="size-6" /> 결과 보기
              </span>
            </Link>
          ) : (
            <Button
              variant={primary?.type === 'END' ? 'ink' : primary?.type === 'CLOSE_QUESTION' ? 'danger' : 'primary'}
              size="xl"
              block
              className="md:w-auto md:min-w-[22rem]"
              loading={pending}
              disabled={disabled}
              onClick={() => void firePrimary()}
              icon={ceremonyBusy ? <ProgressRing fraction={1 - busyLeft / busySpan} /> : <Icon className="size-6" />}
            >
              {primary ? (ceremonyBusy ? '공개 연출 중…' : primary.label) : '대기 중'}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'RESET'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="리허설을 초기화할까요?"
        description="모든 참가자와 응답이 지워지고 대기실 상태로 돌아가요. 참가자는 다시 입장해야 해요."
        confirmLabel="초기화"
        tone="danger"
        onConfirm={async () => {
          await send({ roomId, type: 'RESET' });
        }}
      />
      <ConfirmDialog
        open={confirm === 'ABORT'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="퀴즈를 중단하고 종료할까요?"
        description="지금까지의 점수로 최종 순위가 확정되고, 더 이상 문제를 낼 수 없어요."
        confirmLabel="중단하고 종료"
        tone="danger"
        onConfirm={async () => {
          await send({ roomId, type: 'ABORT' });
        }}
      />
      <ConfirmDialog
        open={confirm === 'END'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="퀴즈를 종료할까요?"
        description="참가자 화면에 각자의 최종 순위가 표시되고, 진행 화면에는 수상자가 모두 공개돼요."
        confirmLabel="종료"
        onConfirm={async () => {
          await send({ roomId, type: 'END' });
        }}
      />
    </div>
  );
}
