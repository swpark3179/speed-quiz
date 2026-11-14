/** Injectable time + timers so the engine can be tested deterministically. */
export interface Clock {
  now(): number;
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realClock: Clock = { now: () => Date.now() };

export const realScheduler: Scheduler = {
  set: (fn, ms) => {
    const t = setTimeout(fn, Math.max(0, ms));
    t.unref?.();
    return t;
  },
  clear: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Outbound event sink. The realtime layer implements it with Socket.IO; tests record calls. */
export interface Bus {
  play(roomId: number, event: string, payload?: unknown): void;
  player(participantId: number, event: string, payload?: unknown): void;
  screen(roomId: number, event: string, payload?: unknown): void;
  admin(roomId: number, event: string, payload?: unknown): void;
  disconnectPlayer(participantId: number): void;
  disconnectRoomPlayers(roomId: number): void;
}

export const nullBus: Bus = {
  play() {},
  player() {},
  screen() {},
  admin() {},
  disconnectPlayer() {},
  disconnectRoomPlayers() {},
};
