import { io, type Socket } from 'socket.io-client';
import type {
  AdminClientToServer,
  AdminServerToClient,
  PlayClientToServer,
  PlayServerToClient,
  ScreenClientToServer,
  ScreenServerToClient,
} from '@sq/shared';

export type PlaySocket = Socket<PlayServerToClient, PlayClientToServer>;
export type ScreenSocket = Socket<ScreenServerToClient, ScreenClientToServer>;
export type AdminSocket = Socket<AdminServerToClient, AdminClientToServer>;

const common = {
  reconnectionDelay: 400,
  reconnectionDelayMax: 3000,
  timeout: 8000,
  withCredentials: true,
} as const;

export function connectPlay(token: string): PlaySocket {
  return io('/play', { ...common, auth: { token } });
}

export function connectScreen(roomId: number, key?: string | null): ScreenSocket {
  return io('/screen', { ...common, auth: { roomId, key: key ?? undefined } });
}

export function connectAdmin(): AdminSocket {
  return io('/admin', { ...common });
}
