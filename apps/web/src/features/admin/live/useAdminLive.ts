import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { AdminSnapshot, ControlCommand, Result } from '@sq/shared';
import { connectAdmin, type AdminSocket } from '@/lib/socket';
import { serverClock } from '@/lib/clock';

export type LiveStatus = 'connecting' | 'connected' | 'reconnecting';

/** Admin control socket: watch a room, keep its AdminSnapshot fresh, send control commands. */
export function useAdminLive(roomId: number) {
  const [snap, setSnap] = useState<AdminSnapshot | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const socketRef = useRef<AdminSocket | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const s = connectAdmin();
    socketRef.current = s;
    const watch = () => {
      s.timeout(5000)
        .emitWithAck('room:watch', { roomId })
        .then((r: Result<AdminSnapshot>) => {
          if (r.ok) {
            setSnap(r.data);
            setError(null);
          } else setError(r.code === 'ROOM_NOT_FOUND' ? '확정된 퀴즈방이 아니거나 찾을 수 없어요.' : r.message);
        })
        .catch(() => {});
    };
    s.on('connect', () => {
      setStatus('connected');
      watch();
      void serverClock.sync(s as never);
    });
    s.on('disconnect', () => setStatus('reconnecting'));
    s.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        s.disconnect();
        navigate(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`, { replace: true });
        return;
      }
      setStatus('reconnecting');
    });
    s.on('admin:state', (st) => {
      if (st.room.id !== roomId) return;
      setSnap((prev) => (!prev || st.v >= prev.v ? st : prev));
    });
    s.on('admin:live', (live) => {
      setSnap((prev) => (prev && prev.current?.question.roomQuestionId === live.roomQuestionId && prev.room.phase === 'QUESTION_ACTIVE' ? { ...prev, live } : prev));
    });
    s.on('admin:roster', ({ roomId: rid, participants }) => {
      if (rid !== roomId) return;
      setSnap((prev) => (prev ? { ...prev, participants } : prev));
    });
    const resync = window.setInterval(() => {
      if (s.connected) void serverClock.sync(s as never, 3);
    }, 60_000);
    return () => {
      window.clearInterval(resync);
      s.emit('room:unwatch', { roomId });
      s.disconnect();
      socketRef.current = null;
    };
  }, [roomId, navigate]);

  const send = useCallback(async (cmd: ControlCommand): Promise<boolean> => {
    const s = socketRef.current;
    if (!s?.connected) {
      toast.error('서버와 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.');
      return false;
    }
    setPending(true);
    try {
      const r = (await s.timeout(5000).emitWithAck('control', cmd)) as Result<AdminSnapshot>;
      if (r.ok) {
        setSnap(r.data);
        return true;
      }
      toast.error(r.message);
      return false;
    } catch {
      toast.error('응답이 없어요. 네트워크를 확인해 주세요.');
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { snap, status, error, pending, send };
}
