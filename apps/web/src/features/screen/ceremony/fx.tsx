import { m, useReducedMotion } from 'motion/react';
import { ease } from '@/design/motion';

/** Soft stage spotlight. Position in stage rem; `sweep` runs a left→right→target pass first. */
export function Spotlight({
  x,
  y,
  visible,
  sweepMs,
}: {
  x: number;
  y: number;
  visible: boolean;
  sweepMs?: number;
}) {
  const reduce = useReducedMotion();
  const sweeping = !!sweepMs && !reduce;
  return (
    <m.div
      className="pointer-events-none absolute top-0 left-0 z-10 h-[60rem] w-[46rem] -mt-[30rem] -ml-[23rem] rounded-full"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(255,246,214,0.62) 0%, rgba(255,234,170,0.32) 35%, rgba(255,226,140,0) 68%)',
      }}
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        x: sweeping ? ['18rem', '102rem', `${x}rem`] : `${x}rem`,
        y: `${y}rem`,
      }}
      transition={{
        opacity: { duration: 0.4 },
        x: sweeping ? { duration: sweepMs! / 1000, times: [0, 0.55, 1], ease: ease.inOut } : { duration: 0.5, ease: ease.inOut },
        y: { duration: 0.5, ease: ease.inOut },
      }}
      aria-hidden="true"
    />
  );
}

/** Rotating light rays behind the active card (CSS rotation; opacity driven by motion). */
export function LightRays({ x, y, opacity }: { x: number; y: number; opacity: number }) {
  return (
    <m.div
      className="pointer-events-none absolute top-0 left-0 z-10 size-[84rem] -mt-[42rem] -ml-[42rem]"
      style={{ x: `${x}rem`, y: `${y}rem` }}
      initial={false}
      animate={{ opacity }}
      transition={{ duration: 0.6 }}
      aria-hidden="true"
    >
      <div
        className="motion-loop size-full animate-spin-slow rounded-full"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(255,214,92,0.55) 0deg 7deg, rgba(255,214,92,0) 7deg 22deg)',
          maskImage: 'radial-gradient(circle, #000 0%, #000 25%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, #000 25%, transparent 70%)',
        }}
      />
    </m.div>
  );
}

/** One white flash (never more than once per reveal — WCAG 2.3.1). */
export function Flash({ flashKey }: { flashKey: number }) {
  if (!flashKey) return null;
  return (
    <m.div
      key={flashKey}
      className="pointer-events-none absolute inset-0 z-40 bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.75, 0] }}
      transition={{ duration: 0.38, times: [0, 0.25, 1] }}
      aria-hidden="true"
    />
  );
}
