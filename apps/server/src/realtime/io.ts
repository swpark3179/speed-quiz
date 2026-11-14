import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace, type Socket } from 'socket.io';
import {
  AppError,
  fail,
  ok,
  type AdminClientToServer,
  type AdminServerToClient,
  type ControlCommand,
  type PlayClientToServer,
  type PlayServerToClient,
  type Result,
  type ScreenClientToServer,
  type ScreenServerToClient,
} from '@sq/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { SESSION_COOKIE, type SessionAdmin } from '../auth/sessions';
import { sha256 } from '../auth/tokens';
import type { Bus } from '../game/runtime';

type PlayNs = Namespace<PlayClientToServer, PlayServerToClient>;
type ScreenNs = Namespace<ScreenClientToServer, ScreenServerToClient>;
type AdminNs = Namespace<AdminClientToServer, AdminServerToClient>;

interface PlayData {
  roomId: number;
  pid: number;
}
interface ScreenData {
  roomId: number;
}
interface AdminData {
  admin: SessionAdmin;
}

const roomKey = (id: number) => `room:${id}`;
const playerKey = (id: number) => `p:${id}`;

function toResult<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (err) {
    if (err instanceof AppError) return fail(err.code, err.message);
    console.error(err);
    return fail('INTERNAL');
  }
}

function safeAck<A extends unknown[]>(ack: unknown): (...args: A) => void {
  return typeof ack === 'function' ? (ack as (...args: A) => void) : () => {};
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** Same-origin check for the admin namespace (blocks cross-site WebSocket hijacking). */
function originAllowed(socket: Socket): boolean {
  const origin = socket.handshake.headers.origin;
  if (!origin) return true; // non-browser clients (tests, CLI) carry no Origin; cookie is still required
  const host = socket.handshake.headers['x-forwarded-host'] ?? socket.handshake.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Simple per-socket token bucket. */
function rateLimiter(perSecond: number) {
  let tokens = perSecond;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(perSecond, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

const AnswerBody = z.object({ roomQuestionId: z.number().int(), choiceId: z.number().int() });
const RoomIdBody = z.object({ roomId: z.number().int().positive() });
const ControlBody = z.discriminatedUnion('type', [
  z.object({ roomId: z.number().int(), type: z.literal('START_QUESTION'), index: z.number().int() }),
  z.object({ roomId: z.number().int(), type: z.literal('CLOSE_QUESTION'), roomQuestionId: z.number().int() }),
  z.object({ roomId: z.number().int(), type: z.literal('SHOW_LEADERBOARD'), index: z.number().int() }),
  z.object({ roomId: z.number().int(), type: z.literal('FINISH') }),
  z.object({ roomId: z.number().int(), type: z.literal('REVEAL_PRIZE'), rank: z.number().int() }),
  z.object({ roomId: z.number().int(), type: z.literal('END') }),
  z.object({ roomId: z.number().int(), type: z.literal('RESET') }),
  z.object({ roomId: z.number().int(), type: z.literal('ABORT') }),
  z.object({ roomId: z.number().int(), type: z.literal('KICK'), participantId: z.number().int() }),
  z.object({ roomId: z.number().int(), type: z.literal('SCREEN_VIEW'), view: z.enum(['AUTO', 'JOIN_QR']) }),
]);

export function createRealtime(httpServer: HttpServer, ctx: AppContext): { io: Server; bus: Bus } {
  const io = new Server(httpServer, {
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64_000,
    connectionStateRecovery: undefined,
  });
  const play = io.of('/play') as PlayNs;
  const screen = io.of('/screen') as ScreenNs;
  const admin = io.of('/admin') as AdminNs;
  const { registry, sessions, db } = ctx;

  /* ---------------- /play ---------------- */
  play.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown })?.token;
    if (typeof token !== 'string' || token.length < 10) return next(new Error('UNAUTHORIZED'));
    const row = db.get<{ id: number; room_id: number; kicked_at: number | null }>(
      'SELECT id, room_id, kicked_at FROM participants WHERE token_hash = ?',
      sha256(token),
    );
    if (!row) return next(new Error('UNAUTHORIZED'));
    if (row.kicked_at) return next(new Error('KICKED'));
    const engine = registry.get(row.room_id);
    if (!engine || !engine.hasParticipant(row.id)) return next(new Error('UNAUTHORIZED'));
    (socket.data as PlayData) = { roomId: row.room_id, pid: row.id };
    next();
  });

  play.on('connection', (socket) => {
    const { roomId, pid } = socket.data as PlayData;
    const allow = rateLimiter(20);
    // One live connection per participant: the newest tab wins.
    void play
      .in(playerKey(pid))
      .fetchSockets()
      .then((others) => {
        for (const o of others) {
          if (o.id === socket.id) continue;
          o.emit('session:replaced');
          o.disconnect(false);
        }
      });
    socket.join([roomKey(roomId), playerKey(pid)]);
    const engine = registry.get(roomId);
    if (!engine) {
      socket.disconnect(true);
      return;
    }
    engine.connect(pid);
    try {
      socket.emit('state:sync', engine.playSnapshot(pid));
    } catch {
      socket.disconnect(true);
      return;
    }

    socket.on('time:ping', (ack) => safeAck<[number]>(ack)(Date.now()));
    socket.on('state:get', (ack) => {
      const e = registry.get(roomId);
      safeAck<[Result<ReturnType<NonNullable<typeof e>['playSnapshot']>>]>(ack)(
        toResult(() => {
          if (!e) throw new AppError('ROOM_NOT_FOUND');
          return e.playSnapshot(pid);
        }),
      );
    });
    socket.on('answer:submit', (payload, ack) => {
      const reply = safeAck<[Result<{ receivedAt: number; choiceId: number }>]>(ack);
      if (!allow()) return reply(fail('RATE_LIMITED'));
      const body = AnswerBody.safeParse(payload);
      if (!body.success) return reply(fail('BAD_REQUEST'));
      const e = registry.get(roomId);
      if (!e) return reply(fail('ROOM_NOT_FOUND'));
      try {
        reply(ok(e.submitAnswer(pid, body.data.roomQuestionId, body.data.choiceId)));
      } catch (err) {
        if (err instanceof AppError) {
          if (err.code === 'ALREADY_ANSWERED') {
            const mine = e.myAnswer(pid);
            if (mine) return reply(ok(mine));
          }
          return reply(fail(err.code, err.message));
        }
        console.error(err);
        reply(fail('INTERNAL'));
      }
    });
    socket.on('disconnect', () => {
      registry.peek(roomId)?.disconnect(pid);
    });
  });

  /* ---------------- /screen ---------------- */
  screen.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as { roomId?: unknown; key?: unknown };
    const roomId = Number(auth.roomId);
    if (!Number.isInteger(roomId) || roomId <= 0) return next(new Error('BAD_REQUEST'));
    const engine = registry.get(roomId);
    if (!engine) return next(new Error('ROOM_NOT_FOUND'));
    const cookie = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    const isAdmin = !!sessions.lookup(cookie);
    const keyOk = typeof auth.key === 'string' && auth.key.length > 0 && auth.key === engine.presenterKey;
    if (!isAdmin && !keyOk) return next(new Error('UNAUTHORIZED'));
    (socket.data as ScreenData) = { roomId };
    next();
  });

  screen.on('connection', (socket) => {
    const { roomId } = socket.data as ScreenData;
    socket.join(roomKey(roomId));
    const engine = registry.get(roomId);
    if (!engine) return void socket.disconnect(true);
    socket.emit('state:sync', engine.screenSnapshot());
    socket.on('time:ping', (ack) => safeAck<[number]>(ack)(Date.now()));
    socket.on('state:get', (ack) => {
      const e = registry.get(roomId);
      safeAck<[Result<ReturnType<NonNullable<typeof e>['screenSnapshot']>>]>(ack)(
        toResult(() => {
          if (!e) throw new AppError('ROOM_NOT_FOUND');
          return e.screenSnapshot();
        }),
      );
    });
  });

  /* ---------------- /admin ---------------- */
  const adminSockets = new Map<string, Set<Socket>>();
  sessions.onRevoke((hash) => {
    for (const s of adminSockets.get(hash) ?? []) s.disconnect(true);
    adminSockets.delete(hash);
  });

  admin.use((socket, next) => {
    if (!originAllowed(socket)) return next(new Error('FORBIDDEN'));
    const cookie = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    const a = sessions.lookup(cookie);
    if (!a) return next(new Error('UNAUTHORIZED'));
    (socket.data as AdminData) = { admin: a };
    next();
  });

  admin.on('connection', (socket) => {
    const { admin: a } = socket.data as AdminData;
    const set = adminSockets.get(a.sessionHash) ?? new Set();
    set.add(socket);
    adminSockets.set(a.sessionHash, set);
    socket.on('disconnect', () => set.delete(socket));

    socket.on('time:ping', (ack) => safeAck<[number]>(ack)(Date.now()));
    socket.on('room:watch', (payload, ack) => {
      const reply = safeAck<[Result<ReturnType<NonNullable<ReturnType<typeof registry.get>>['adminSnapshot']>>]>(ack);
      const body = RoomIdBody.safeParse(payload);
      if (!body.success) return reply(fail('BAD_REQUEST'));
      const e = registry.get(body.data.roomId);
      if (!e) return reply(fail('ROOM_NOT_FOUND'));
      socket.join(roomKey(body.data.roomId));
      reply(ok(e.adminSnapshot()));
    });
    socket.on('room:unwatch', (payload) => {
      const body = RoomIdBody.safeParse(payload);
      if (body.success) socket.leave(roomKey(body.data.roomId));
    });
    socket.on('control', (payload, ack) => {
      const reply = safeAck<[Result<ReturnType<NonNullable<ReturnType<typeof registry.get>>['adminSnapshot']>>]>(ack);
      if (!sessions.lookup(parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE])) {
        socket.disconnect(true);
        return reply(fail('UNAUTHORIZED'));
      }
      const body = ControlBody.safeParse(payload);
      if (!body.success) return reply(fail('BAD_REQUEST'));
      const e = registry.get(body.data.roomId);
      if (!e) return reply(fail('ROOM_NOT_FOUND'));
      reply(
        toResult(() => {
          e.control(body.data as ControlCommand);
          return e.adminSnapshot();
        }),
      );
    });
  });

  // Untyped emit helper: payload types are enforced where the engine builds them.
  type Emitter = { emit: (event: string, ...args: unknown[]) => boolean };
  const emit = (target: unknown, event: string, payload: unknown) =>
    payload === undefined ? (target as Emitter).emit(event) : (target as Emitter).emit(event, payload);
  const bus: Bus = {
    play: (roomId, event, payload) => emit(play.to(roomKey(roomId)), event, payload),
    player: (pid, event, payload) => emit(play.to(playerKey(pid)), event, payload),
    screen: (roomId, event, payload) => emit(screen.to(roomKey(roomId)), event, payload),
    admin: (roomId, event, payload) => emit(admin.to(roomKey(roomId)), event, payload),
    disconnectPlayer: (pid) => play.in(playerKey(pid)).disconnectSockets(false),
    disconnectRoomPlayers: (roomId) => play.in(roomKey(roomId)).disconnectSockets(false),
  };

  return { io, bus };
}
