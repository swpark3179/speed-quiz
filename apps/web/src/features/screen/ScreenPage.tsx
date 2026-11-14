import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { MonitorX, WifiOff } from 'lucide-react';
import { connectScreen, type ScreenSocket } from '@/lib/socket';
import { useGameSocket } from '@/stores/useGameSocket';
import type { GameState } from '@/stores/game.reducer';
import { usePrefs } from '@/stores/prefs';
import { useDocumentTitle, useHtmlAttr, useWakeLock } from '@/hooks/dom';
import { spring } from '@/design/motion';
import { Logo, Spinner } from '@/ui/display';
import { cn } from '@/lib/format';
import { Stage } from './Stage';
import { StartOverlay } from './StartOverlay';
import { Toolbar } from './Toolbar';
import { SlashWipe } from './SlashWipe';
import { JoinPanel } from './JoinPanel';
import { useIdle, useIsEmbedded } from './hooks';
import { LobbyScene } from './scenes/LobbyScene';
import { QuestionScene } from './scenes/QuestionScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { FinalScene, ThanksScene } from './scenes/FinalScene';
import { CeremonyScene } from './scenes/CeremonyScene';

const FATAL_TEXT: Record<string, string> = {
  UNAUTHORIZED: '진행 화면을 열 권한이 없어요. 관리자 화면에서 다시 열거나 진행 화면 링크를 확인해 주세요.',
  ROOM_NOT_FOUND: '퀴즈방을 찾을 수 없어요. 확정된 퀴즈방인지 확인해 주세요.',
  BAD_REQUEST: '잘못된 진행 화면 주소예요.',
};

function sceneKeyOf(state: GameState): string {
  const room = state.room;
  if (!room) return 'loading';
  switch (room.phase) {
    case 'LOBBY':
      return 'lobby';
    case 'QUESTION_ACTIVE':
    case 'QUESTION_REVEAL':
      return state.current ? `q-${state.current.question.index}` : 'lobby';
    case 'LEADERBOARD':
      return state.leaderboard ? `lb-${state.leaderboard.afterIndex}` : `q-${room.currentIndex}`;
    case 'FINAL_RESULTS':
      return state.final ? 'final' : 'loading';
    case 'PRIZE_REVEAL':
      return 'ceremony';
    case 'ENDED': {
      const winners = state.ended?.winners.length ?? state.final?.winnerCount ?? 0;
      return winners > 0 ? 'ceremony' : 'thanks';
    }
    default:
      return 'loading';
  }
}

function Scene({ state, sceneKey }: { state: GameState; sceneKey: string }) {
  if (sceneKey === 'lobby') return <LobbyScene state={state} />;
  if (sceneKey.startsWith('q-') && state.current) return <QuestionScene state={state} />;
  if (sceneKey.startsWith('lb-') && state.leaderboard) return <LeaderboardScene state={state} />;
  if (sceneKey === 'final' && state.final) return <FinalScene state={state} />;
  if (sceneKey === 'ceremony') return <CeremonyScene state={state} />;
  if (sceneKey === 'thanks') return <ThanksScene state={state} />;
  return (
    <div className="flex h-full items-center justify-center text-fg-muted">
      <Spinner className="size-[4rem]" />
    </div>
  );
}

export default function ScreenPage() {
  const { roomId: roomIdParam } = useParams();
  const roomId = Number(roomIdParam);
  const key = useMemo(() => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('key'), []);
  const embedded = useIsEmbedded();
  const theme = usePrefs((s) => s.stageTheme);
  const [socket, setSocket] = useState<ScreenSocket | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [started, setStarted] = useState(embedded);
  const idle = useIdle(3000);

  useHtmlAttr('data-stage');
  useWakeLock(!embedded);

  useEffect(() => {
    if (!Number.isInteger(roomId) || roomId <= 0) {
      setFatal('BAD_REQUEST');
      return;
    }
    const s = connectScreen(roomId, key);
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [roomId, key]);

  const onFatal = useCallback((reason: string) => {
    if (reason === 'UNAUTHORIZED' || reason === 'ROOM_NOT_FOUND' || reason === 'BAD_REQUEST') setFatal(reason);
  }, []);
  const { state, status } = useGameSocket(socket, onFatal);
  useDocumentTitle(state.room ? `진행 화면 · ${state.room.title}` : '진행 화면');

  const sceneKey = sceneKeyOf(state);
  const showJoinOverlay = state.view === 'JOIN_QR' && state.room && state.room.phase !== 'LOBBY' && !!state.room.joinUrl;

  return (
    <Stage theme={theme} className={cn(idle && started && 'cursor-none')}>
      {fatal ? (
        <div className="flex h-full flex-col items-center justify-center gap-6 px-[10rem] text-center">
          <MonitorX className="size-[6rem] text-danger" aria-hidden="true" />
          <Logo className="text-[2rem]" />
          <p className="text-[2.5rem] font-bold">{FATAL_TEXT[fatal] ?? '진행 화면에 연결할 수 없어요.'}</p>
        </div>
      ) : !state.room ? (
        <div className="flex h-full flex-col items-center justify-center gap-6 text-fg-muted">
          <Logo className="text-[2.5rem]" />
          <Spinner className="size-[4rem]" />
        </div>
      ) : (
        <SlashWipe sceneKey={sceneKey}>
          <Scene state={state} sceneKey={sceneKey} />
        </SlashWipe>
      )}

      <AnimatePresence>
        {showJoinOverlay && (
          <m.div
            key="join-overlay"
            className="absolute inset-0 z-30 flex items-center justify-center bg-ink/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <m.div
              className="rounded-[2.5rem] bg-bg px-[4rem] py-[3rem] shadow-lg"
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={spring.gentle}
            >
              <JoinPanel joinUrl={state.room!.joinUrl!} code={state.room!.code} compact />
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {state.room && status === 'reconnecting' && !fatal && (
          <m.div
            className="absolute top-[2rem] right-[2rem] z-40 flex items-center gap-3 rounded-full bg-danger px-6 py-3 text-[1.5rem] font-bold text-white shadow-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
          >
            <WifiOff className="size-[2rem]" aria-hidden="true" />
            다시 연결 중…
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!started && state.room && !fatal && <StartOverlay title={state.room.title} onStart={() => setStarted(true)} />}
      </AnimatePresence>

      {!embedded && state.room && <Toolbar visible={!idle || !started} title={state.room.title} code={state.room.code} />}
    </Stage>
  );
}
