import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { toast } from 'sonner';
import type { Result } from '@sq/shared';
import { connectPlay, type PlaySocket } from '@/lib/socket';
import { serverClock } from '@/lib/clock';
import { useGameSocket } from '@/stores/useGameSocket';
import { clearSession, loadSession } from '@/stores/session';
import { useDocumentTitle, useHtmlAttr, useWakeLock } from '@/hooks/dom';
import { haptic, HAPTIC } from '@/design/haptics';
import { screenVariants } from '@/design/motion';
import { PlayHeader } from './PlayHeader';
import { StandingsBar } from './StandingsBar';
import { ConnectionOverlay } from './ConnectionOverlay';
import { LobbyScreen } from './screens/LobbyScreen';
import { QuestionScreen, type PendingAnswer } from './screens/QuestionScreen';
import { ResultScreen } from './screens/ResultScreen';
import { CeremonyWaitScreen } from './screens/CeremonyWaitScreen';
import { FinalScreen } from './screens/FinalScreen';
import { EndStateScreen } from './screens/EndStateScreen';

type Fatal = 'KICKED' | 'REPLACED' | 'RESET' | 'UNAUTHORIZED' | null;

export default function PlayPage() {
  const { code = '' } = useParams<{ code: string }>();
  const session = useMemo(() => loadSession(code), [code]);
  if (!session) return <Navigate to={`/join/${code}`} replace />;
  return <PlayInner code={code} token={session.token} nickname={session.nickname} />;
}

function PlayInner({ code, token, nickname }: { code: string; token: string; nickname: string }) {
  const navigate = useNavigate();
  const [socket, setSocket] = useState<PlaySocket | null>(null);
  const [fatal, setFatal] = useState<Fatal>(null);
  useHtmlAttr('data-play');
  useWakeLock(!fatal);

  useEffect(() => {
    const s = connectPlay(token);
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [token]);

  const onFatal = useCallback(
    (reason: string) => {
      if (reason === 'UNAUTHORIZED' || reason === 'ROOM_NOT_FOUND') {
        clearSession(code);
        navigate(`/join/${code}`, { replace: true });
        return;
      }
      if (reason === 'KICKED' || reason === 'RESET') clearSession(code);
      setFatal(reason as Fatal);
      socket?.disconnect();
    },
    [code, navigate, socket],
  );

  const { state, status, dispatch } = useGameSocket(socket, onFatal);
  const room = state.room;
  useDocumentTitle(room?.title ?? '퀴즈');

  /* ---------------- answering ---------------- */
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const qid = state.current?.question.roomQuestionId ?? null;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    setPending(null);
  }, [qid]);

  const send = useCallback(
    async (roomQuestionId: number, choiceId: number) => {
      if (!socket) return;
      const deadline = (state.current?.timing.endsAt ?? 0) + 300;
      for (let attempt = 0; ; attempt++) {
        if (!socket.connected) {
          setPending({ choiceId, status: 'queued' });
          await new Promise<void>((resolve) => {
            const done = () => {
              socket.off('connect', done);
              resolve();
            };
            socket.on('connect', done);
            window.setTimeout(done, Math.max(0, deadline - serverClock.now()));
          });
          if (!socket.connected) break;
        }
        try {
          const r = (await socket.timeout(3000).emitWithAck('answer:submit', { roomQuestionId, choiceId })) as Result<{
            receivedAt: number;
            choiceId: number;
          }>;
          if (r.ok) {
            dispatch({ type: 'answer:local', payload: { choiceId: r.data.choiceId, receivedAt: r.data.receivedAt } });
            setPending({ choiceId: r.data.choiceId, status: 'acked' });
            haptic(HAPTIC.lock);
            return;
          }
          setPending({ choiceId, status: 'rejected' });
          haptic(HAPTIC.wrong);
          toast.error(r.message);
          window.setTimeout(() => setPending((p) => (p?.status === 'rejected' ? null : p)), 700);
          return;
        } catch {
          if (serverClock.now() > deadline || attempt > 6) break;
        }
      }
      setPending({ choiceId, status: 'rejected' });
      toast.error('연결이 불안정해서 제출하지 못했어요.');
    },
    [socket, dispatch, state.current?.timing.endsAt],
  );

  const onSelect = useCallback(
    (choiceId: number) => {
      if (!qid || pendingRef.current || state.current?.myAnswer) return;
      setPending({ choiceId, status: 'sending' });
      haptic(HAPTIC.tap);
      void send(qid, choiceId);
    },
    [qid, send, state.current?.myAnswer],
  );

  /* ---------------- render ---------------- */
  if (fatal) return <EndStateScreen reason={fatal} code={code} />;

  const phase = room?.phase;
  let screenKey = 'loading';
  let screen: React.ReactNode = <div className="flex flex-1 items-center justify-center text-fg-muted">불러오는 중…</div>;
  if (room && state.me) {
    if (phase === 'LOBBY') {
      screenKey = 'lobby';
      screen = <LobbyScreen state={state} />;
    } else if (phase === 'QUESTION_ACTIVE' && state.current) {
      screenKey = `q-${state.current.question.roomQuestionId}`;
      screen = <QuestionScreen state={state} pending={pending} onSelect={onSelect} />;
    } else if ((phase === 'QUESTION_REVEAL' || phase === 'LEADERBOARD') && state.reveal) {
      screenKey = `r-${state.reveal.roomQuestionId}`;
      screen = <ResultScreen state={state} />;
    } else if (phase === 'FINAL_RESULTS' || phase === 'PRIZE_REVEAL') {
      screenKey = 'ceremony';
      screen = <CeremonyWaitScreen state={state} />;
    } else if (phase === 'ENDED') {
      screenKey = 'final';
      screen = <FinalScreen state={state} />;
    } else {
      screenKey = 'wait';
      screen = <LobbyScreen state={state} />;
    }
  }

  return (
    <div className="no-tap flex h-dvh flex-col overflow-hidden bg-bg">
      <PlayHeader state={state} nickname={nickname} />
      <StandingsBar state={state} />
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div key={screenKey} className="flex min-h-0 flex-1 flex-col" {...screenVariants}>
          {screen}
        </m.div>
      </AnimatePresence>
      <ConnectionOverlay status={status} critical={phase === 'QUESTION_ACTIVE'} />
    </div>
  );
}
