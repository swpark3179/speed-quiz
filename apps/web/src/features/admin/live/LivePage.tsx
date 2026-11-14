import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { useDocumentTitle, useWakeLock } from '@/hooks/dom';
import { Logo, Spinner } from '@/ui/display';
import { useAdminLive } from './useAdminLive';
import { PhaseStepper } from './PhaseStepper';
import { ProgressPanel } from './ProgressPanel';
import { RecentFeed, ResponseMeter } from './StatsPanels';
import { ParticipantsPanel } from './ParticipantsPanel';
import { JoinCard } from './JoinCard';
import { PresenterPreview } from './PresenterPreview';
import { ActionBar } from './ActionBar';

export default function LivePage() {
  const { id } = useParams();
  const roomId = Number(id);
  const { snap, status, error, pending, send } = useAdminLive(roomId);
  useDocumentTitle(snap ? `진행 · ${snap.room.title}` : '진행');
  useWakeLock();

  const openPresenter = useCallback(() => {
    window.open(`/screen/${roomId}`, 'sq-presenter', 'popup,width=1280,height=720');
  }, [roomId]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo />
        <p className="text-xl font-bold">{error}</p>
        <Link
          to={`/admin/rooms/${roomId}`}
          className="inline-flex h-12 items-center rounded-md border-2 border-ink bg-surface px-5 font-bold text-ink hover:bg-n-50"
        >
          퀴즈방으로 돌아가기
        </Link>
      </div>
    );
  }
  if (!snap) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-n-400">
        <Spinner className="size-8" />
      </div>
    );
  }

  const phase = snap.room.phase;
  const showAnswerFeed = phase !== 'QUESTION_ACTIVE';

  return (
    <div className="min-h-dvh bg-bg pb-40 md:pb-28">
      <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
          <Link
            to={`/admin/rooms/${roomId}`}
            className="inline-flex size-10 items-center justify-center rounded-sm text-fg-muted hover:bg-n-100"
            aria-label="퀴즈방으로 돌아가기"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-fg-muted">진행 컨트롤</p>
            <h1 className="truncate text-lg font-extrabold" title={snap.room.title}>
              {snap.room.title}
            </h1>
          </div>
          <div className="order-last w-full md:order-none md:w-auto">
            <PhaseStepper phase={phase} index={snap.room.currentIndex} total={snap.room.total} />
          </div>
        </div>
        <AnimatePresence>
          {status !== 'connected' && (
            <m.div
              className="flex items-center justify-center gap-2 bg-danger px-4 py-2 text-sm font-bold text-white"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              role="status"
            >
              <WifiOff className="size-4" />
              {status === 'connecting' ? '연결 중…' : '서버와 연결이 끊겼어요. 다시 연결하는 중…'}
            </m.div>
          )}
        </AnimatePresence>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-3 lg:gap-6">
        <section className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <ProgressPanel snap={snap} />
          {(phase === 'LOBBY' || phase === 'QUESTION_ACTIVE' || phase === 'QUESTION_REVEAL' || phase === 'LEADERBOARD') && (
            <div className="grid gap-5 md:grid-cols-2">
              <ResponseMeter snap={snap} />
              <RecentFeed snap={snap} showCorrect={showAnswerFeed} />
            </div>
          )}
          <PresenterPreview roomId={roomId} onOpen={openPresenter} />
        </section>
        <aside className="flex min-w-0 flex-col gap-5">
          <JoinCard snap={snap} />
          <ParticipantsPanel snap={snap} onKick={(p) => send({ roomId, type: 'KICK', participantId: p.id })} />
        </aside>
      </main>

      <ActionBar snap={snap} send={send} pending={pending} connected={status === 'connected'} onOpenPresenter={openPresenter} />
    </div>
  );
}
