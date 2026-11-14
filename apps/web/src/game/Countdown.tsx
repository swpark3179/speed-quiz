import { useLayoutEffect, useRef } from 'react';
import { m } from 'motion/react';
import { serverClock } from '@/lib/clock';
import { useRemaining } from '@/lib/time';
import { cn } from '@/lib/format';

/**
 * Linear time bar driven by a single CSS transition (no per-frame JS).
 * Stays full until `opensAt`, then shrinks to 0 at `endsAt` on the server clock.
 */
export function CountdownBar({ opensAt, endsAt, className }: { opensAt: number; endsAt: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const toOpen = useRemaining(opensAt, 250);
  const remaining = useRemaining(endsAt, 1000);
  const open = toOpen <= 0;
  const urgent = open && remaining <= 5000;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const total = Math.max(1, endsAt - opensAt);
    if (!open) {
      el.style.transition = 'none';
      el.style.transform = 'scaleX(1)';
      return;
    }
    const left = Math.max(0, endsAt - serverClock.now());
    el.style.transition = 'none';
    el.style.transform = `scaleX(${Math.min(1, left / total)})`;
    void el.offsetWidth; // commit start frame
    el.style.transition = `transform ${left}ms linear, background-color 300ms`;
    el.style.transform = 'scaleX(0)';
  }, [open, opensAt, endsAt]);

  return (
    <div
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-n-200', className)}
      role="timer"
      aria-label={open ? `남은 시간 ${Math.ceil(remaining / 1000)}초` : '곧 시작'}
    >
      <div ref={ref} className={cn('h-full w-full origin-left rounded-full', urgent ? 'bg-danger' : 'bg-spark-400')} />
    </div>
  );
}

/** Circular countdown with the seconds inside; heartbeat in the last 5 seconds. */
export function CountdownRing({
  opensAt,
  endsAt,
  size = 160,
  className,
  onSecond,
}: {
  opensAt: number;
  endsAt: number;
  size?: number | string;
  className?: string;
  onSecond?: (sec: number) => void;
}) {
  const circleRef = useRef<SVGCircleElement>(null);
  const toOpen = useRemaining(opensAt, 250);
  const remaining = useRemaining(endsAt, 1000);
  const open = toOpen <= 0;
  const secs = open ? Math.ceil(remaining / 1000) : Math.ceil((endsAt - opensAt) / 1000);
  const urgent = open && secs <= 5 && secs > 0;
  const R = 44;
  const C = 2 * Math.PI * R;
  const lastSec = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (open && secs !== lastSec.current) {
      lastSec.current = secs;
      onSecond?.(secs);
    }
  }, [open, secs, onSecond]);

  useLayoutEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    const total = Math.max(1, endsAt - opensAt);
    if (!open) {
      el.style.transition = 'none';
      el.style.strokeDashoffset = '0';
      return;
    }
    const left = Math.max(0, endsAt - serverClock.now());
    el.style.transition = 'none';
    el.style.strokeDashoffset = String(C * (1 - left / total));
    void el.getBoundingClientRect();
    el.style.transition = `stroke-dashoffset ${left}ms linear, stroke 300ms`;
    el.style.strokeDashoffset = String(C);
  }, [open, opensAt, endsAt, C]);

  return (
    <m.div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      animate={urgent ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] } : { duration: 0.2 }}
      key={urgent ? `beat-${secs}` : 'calm'}
      role="timer"
      aria-label={`남은 시간 ${secs}초`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="var(--surface)" stroke="var(--line)" strokeWidth="8" />
        <circle
          ref={circleRef}
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={urgent || secs === 0 ? 'var(--color-danger)' : 'var(--color-spark-400)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
        />
      </svg>
      <span className={cn('tabular relative font-black', urgent ? 'text-danger-text' : 'text-fg')} style={{ fontSize: `calc(${typeof size === 'number' ? `${size}px` : size} * 0.4)` }}>
        {secs}
      </span>
    </m.div>
  );
}
