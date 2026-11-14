import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { serverClock } from './clock';

export interface Beat {
  /** ms after startAt */
  at: number;
  /** late=true when the beat is already well past (reconnect / late join): apply the end state, skip animation */
  run: (late: boolean) => void;
}

const LATE_MS = 350;

/**
 * Schedules beats against server time. Re-runs whenever `key` or `startAt` changes; beats that are
 * already past fire immediately with late=true so a reconnecting client lands on the right frame.
 */
export function useBeats(key: string | number | null, startAt: number | null, beats: Beat[]): void {
  const ref = useRef(beats);
  ref.current = beats;
  useEffect(() => {
    if (startAt === null || key === null) return;
    const timers: number[] = [];
    ref.current.forEach((b, i) => {
      const delay = startAt + b.at - serverClock.now();
      if (delay <= 0) ref.current[i]?.run(delay < -LATE_MS);
      else timers.push(window.setTimeout(() => ref.current[i]?.run(false), delay));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [key, startAt]);
}

/** Remaining ms until a server timestamp, updated every `stepMs` (and at 0). */
export function useRemaining(endsAt: number | null, stepMs = 100): number {
  const [remaining, setRemaining] = useState(() => (endsAt === null ? 0 : Math.max(0, endsAt - serverClock.now())));
  useEffect(() => {
    if (endsAt === null) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const r = Math.max(0, endsAt - serverClock.now());
      const q = Math.ceil(r / stepMs);
      if (q !== last) {
        last = q;
        setRemaining(r);
      }
      if (r > 0) raf = window.setTimeout(tick, Math.min(stepMs, r)) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [endsAt, stepMs]);
  return remaining;
}

/** true once server time passes `at`. */
export function useReached(at: number | null): boolean {
  const remaining = useRemaining(at, 1000);
  return at !== null && remaining <= 0;
}

export function useClockVersion(): number {
  return useSyncExternalStore(
    (cb) => serverClock.subscribe(cb),
    () => serverClock.offset,
  );
}
