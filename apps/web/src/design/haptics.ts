import { usePrefs } from '@/stores/prefs';

/** Vibration patterns (Android only — iOS ignores navigator.vibrate). */
export const HAPTIC = {
  tap: 10,
  lock: 20,
  correct: [30, 50, 30],
  wrong: [120],
  tick: 8,
  win: [50, 50, 50, 50, 200],
} as const;

export function haptic(pattern: number | readonly number[]): void {
  if (!usePrefs.getState().haptics) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern as number | number[]);
  } catch {
    /* ignore */
  }
}
