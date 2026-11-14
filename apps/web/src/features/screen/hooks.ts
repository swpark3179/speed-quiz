import { useEffect, useRef, useState } from 'react';

/** Current root font-size in px (the presenter scales rem with the viewport). */
export function useRemPx(): number {
  const read = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const [px, setPx] = useState(read);
  useEffect(() => {
    const onResize = () => setPx(read());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return px;
}

/** true after `ms` without pointer/keyboard activity (used to hide the toolbar + cursor). */
export function useIdle(ms = 3000): boolean {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setIdle(true), ms);
    };
    wake();
    const evs = ['mousemove', 'mousedown', 'keydown', 'touchstart'] as const;
    for (const e of evs) window.addEventListener(e, wake, { passive: true });
    return () => {
      window.clearTimeout(timer.current);
      for (const e of evs) window.removeEventListener(e, wake);
    };
  }, [ms]);
  return idle;
}

export function useIsEmbedded(): boolean {
  const [embedded] = useState(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });
  return embedded;
}

/** Value that changes identity whenever `n` grows — used to replay a "bump" animation. */
export function useBumpKey(n: number): number {
  const [k, setK] = useState(0);
  const prev = useRef(n);
  useEffect(() => {
    if (n > prev.current) setK((x) => x + 1);
    prev.current = n;
  }, [n]);
  return k;
}

export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
