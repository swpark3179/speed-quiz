import { useEffect } from 'react';

/** Toggle a boolean data-* attribute on <html> while the component is mounted. */
export function useHtmlAttr(name: string, on = true): void {
  useEffect(() => {
    if (!on) return;
    document.documentElement.setAttribute(name, '');
    return () => document.documentElement.removeAttribute(name);
  }, [name, on]);
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · 스피드 퀴즈` : '스피드 퀴즈';
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/** Keep the screen awake on play / presenter screens (re-acquired when the page becomes visible). */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        /* not allowed (e.g. battery saver) */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}

/** Global key handler (ignored while typing in inputs). */
export function useHotkeys(handler: (e: KeyboardEvent) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, enabled]);
}
