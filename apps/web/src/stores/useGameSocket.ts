import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Result } from '@sq/shared';
import { serverClock } from '@/lib/clock';
import { gameReducer, initialGame, type GameEvent, type GameState } from './game.reducer';

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

const GAME_EVENTS: GameEvent['type'][] = [
  'state:sync',
  'roster:delta',
  'question:start',
  'question:progress',
  'question:reveal',
  'you:result',
  'leaderboard:show',
  'game:final',
  'prize:reveal',
  'game:ended',
  'you:final',
  'screen:view',
];

/**
 * Wires a /play or /screen socket into the shared game reducer:
 * clock sync on (re)connect, resync on version gaps and when the tab becomes visible again.
 */
export function useGameSocket(socket: Socket | null, onFatal?: (reason: string) => void) {
  const [state, dispatch] = useReducer(gameReducer, initialGame);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const fatalRef = useRef(onFatal);
  fatalRef.current = onFatal;

  const resync = useCallback(() => {
    if (!socket?.connected) return;
    socket
      .timeout(5000)
      .emitWithAck('state:get')
      .then((r: Result<unknown>) => {
        if (r.ok) dispatch({ type: 'state:sync', payload: r.data as never });
      })
      .catch(() => {});
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const handlers = GAME_EVENTS.map((type) => {
      const h = (payload: unknown) => dispatch({ type, payload } as GameEvent);
      socket.on(type as never, h as never);
      return [type, h] as const;
    });
    const onConnect = () => {
      setStatus('connected');
      void serverClock.sync(socket as never);
    };
    const onDisconnect = (reason: string) => {
      setStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
    };
    const onError = (err: Error) => {
      if (['UNAUTHORIZED', 'KICKED', 'ROOM_NOT_FOUND', 'BAD_REQUEST'].includes(err.message)) {
        fatalRef.current?.(err.message);
        setStatus('offline');
      } else setStatus('reconnecting');
    };
    const fatal = (reason: string) => () => fatalRef.current?.(reason);
    const onKicked = fatal('KICKED');
    const onReplaced = fatal('REPLACED');
    const onReset = fatal('RESET');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.on('session:kicked' as never, onKicked as never);
    socket.on('session:replaced' as never, onReplaced as never);
    socket.on('room:reset' as never, onReset as never);
    const resyncTimer = window.setInterval(() => {
      if (socket.connected) void serverClock.sync(socket as never, 3);
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      else {
        resync();
        void serverClock.sync(socket as never, 3);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    if (socket.connected) onConnect();
    return () => {
      for (const [type, h] of handlers) socket.off(type as never, h as never);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off('session:kicked' as never, onKicked as never);
      socket.off('session:replaced' as never, onReplaced as never);
      socket.off('room:reset' as never, onReset as never);
      window.clearInterval(resyncTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [socket, resync]);

  useEffect(() => {
    if (state.needsResync) resync();
  }, [state.needsResync, state.v, resync]);

  return { state, status, dispatch, resync } as { state: GameState; status: ConnStatus; dispatch: typeof dispatch; resync: () => void };
}
