import { CONFETTI_COLORS } from './choices';

type ConfettiFn = (opts?: Record<string, unknown>) => Promise<undefined> | null;
let instance: ConfettiFn | null = null;
let loading: Promise<ConfettiFn | null> | null = null;

function reduced(): boolean {
  return (
    document.documentElement.hasAttribute('data-reduce-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

async function get(): Promise<ConfettiFn | null> {
  if (instance) return instance;
  if (!loading) {
    loading = import('canvas-confetti').then((m) => {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 'var(--z-confetti)',
      });
      document.body.appendChild(canvas);
      instance = m.default.create(canvas, { resize: true, useWorker: true }) as unknown as ConfettiFn;
      return instance;
    });
  }
  return loading;
}

const isMobile = () => window.matchMedia?.('(max-width: 767px)').matches;

/** Single burst from a point (0..1 viewport coordinates). */
export async function burst(opts: { x?: number; y?: number; count?: number; colors?: string[]; spread?: number } = {}) {
  if (reduced()) return;
  const c = await get();
  const count = opts.count ?? (isMobile() ? 60 : 160);
  void c?.({
    particleCount: count,
    spread: opts.spread ?? 80,
    startVelocity: 45,
    ticks: 220,
    origin: { x: opts.x ?? 0.5, y: opts.y ?? 0.55 },
    colors: opts.colors ?? CONFETTI_COLORS,
    scalar: isMobile() ? 0.9 : 1.2,
    disableForReducedMotion: true,
  });
}

/** Two side cannons + a few fireworks bursts (grand prize). */
export async function celebrate(durationMs = 3000) {
  if (reduced()) return;
  const c = await get();
  if (!c) return;
  const big = isMobile() ? 70 : 150;
  void c({ particleCount: big, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors: CONFETTI_COLORS, startVelocity: 70 });
  void c({ particleCount: big, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors: CONFETTI_COLORS, startVelocity: 70 });
  const end = Date.now() + durationMs;
  const tick = () => {
    if (Date.now() > end) return;
    void c({
      particleCount: isMobile() ? 18 : 40,
      startVelocity: 30,
      spread: 360,
      ticks: 80,
      gravity: 0.6,
      origin: { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.35 },
      colors: CONFETTI_COLORS,
    });
    window.setTimeout(tick, 250);
  };
  window.setTimeout(tick, 250);
}
