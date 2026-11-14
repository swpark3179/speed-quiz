import { useEffect, useRef, type ReactNode } from 'react';
import { animate, m, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ease, spring } from '@/design/motion';
import { cn, num } from '@/lib/format';

/** Black Han Sans burst stamp ("정답!", "땡!", "시간 종료"). */
export function Stamp({
  children,
  tone = 'white',
  className,
  delay = 0,
  rotate = -4,
}: {
  children: ReactNode;
  tone?: 'white' | 'ink' | 'spark' | 'danger';
  className?: string;
  delay?: number;
  rotate?: number;
}) {
  const color = { white: 'text-white', ink: 'text-ink', spark: 'text-spark-400', danger: 'text-danger' }[tone];
  return (
    <m.div
      className={cn('font-display leading-none drop-shadow-[0_4px_0_rgb(0_0_0/0.18)] select-none', color, className)}
      initial={{ scale: 1.8, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate, opacity: 1 }}
      transition={{ ...spring.pop, delay, opacity: { duration: 0.12, delay } }}
      role="status"
    >
      {children}
    </m.div>
  );
}

/** Count-up that writes to textContent directly (no React re-render per frame). */
export function useCountUp(value: number, opts: { from?: number; duration?: number; delay?: number; enabled?: boolean } = {}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const fromRef = useRef(opts.from ?? value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = opts.from ?? fromRef.current;
    if (reduce || opts.enabled === false || from === value) {
      el.textContent = num(value);
      fromRef.current = value;
      return;
    }
    el.textContent = num(from);
    const controls = animate(from, value, {
      duration: opts.duration ?? 0.7,
      delay: opts.delay ?? 0,
      ease: ease.count,
      onUpdate: (v) => {
        el.textContent = num(Math.round(v));
      },
    });
    fromRef.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, opts.enabled]);
  return ref;
}

export function CountUp({
  value,
  from,
  duration,
  delay,
  className,
  prefix,
}: {
  value: number;
  from?: number;
  duration?: number;
  delay?: number;
  className?: string;
  prefix?: string;
}) {
  const ref = useCountUp(value, { from, duration, delay });
  return (
    <span className={cn('tabular', className)}>
      {prefix}
      <span ref={ref}>{num(from ?? value)}</span>
    </span>
  );
}

/** "5위 ▲2" — arrow + number + colour together (never colour alone). */
export function RankChip({
  rank,
  prevRank,
  className,
  size = 'md',
  inverse,
}: {
  rank: number;
  prevRank: number | null;
  className?: string;
  size?: 'md' | 'lg';
  /** on coloured backgrounds: white pills with coloured text */
  inverse?: boolean;
}) {
  const diff = prevRank === null ? 0 : prevRank - rank;
  return (
    <span className={cn('inline-flex items-center gap-2 font-extrabold', size === 'lg' ? 'text-2xl' : 'text-base', className)}>
      <span className="tabular">{rank}위</span>
      {diff > 0 && (
        <m.span
          className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-sm', inverse ? 'bg-white text-success' : 'bg-success text-white')}
          initial={{ y: 0 }}
          animate={{ y: [0, -6, 0, -6, 0] }}
          transition={{ duration: 0.9, delay: 0.2 }}
          aria-label={`${diff}계단 상승`}
        >
          <ArrowUp className="size-4" strokeWidth={3} />
          {diff}
        </m.span>
      )}
      {diff < 0 && (
        <m.span
          className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-sm', inverse ? 'bg-white text-danger-text' : 'bg-danger text-white')}
          initial={{ y: 0 }}
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 0.5, delay: 0.2 }}
          aria-label={`${-diff}계단 하락`}
        >
          <ArrowDown className="size-4" strokeWidth={3} />
          {-diff}
        </m.span>
      )}
      {diff === 0 && prevRank !== null && (
        <span className="inline-flex items-center rounded-full bg-n-200 px-2 py-0.5 text-sm text-n-700" aria-label="순위 변동 없음">
          <Minus className="size-4" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

/** Three bouncing dots ("기다리는 중"). */
export function WaitingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-end gap-1', className)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="motion-loop size-2 animate-dots rounded-full bg-current"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

/** Marquee light bulbs around the room code. */
export function MarqueeBorder({ children, className, bulbs = 18 }: { children: ReactNode; className?: string; bulbs?: number }) {
  const side = Math.max(4, Math.round(bulbs / 2));
  const row = (offset: number) =>
    Array.from({ length: side }, (_, i) => (
      <span
        key={i}
        className="motion-loop size-[0.9rem] animate-bulbs rounded-full bg-spark-400 shadow-[0_0_0.6rem_rgb(255_194_51/0.9)]"
        style={{ animationDelay: `${((i + offset) % 2) * 600}ms` }}
      />
    ));
  return (
    <div className={cn('relative rounded-[2rem] bg-ink px-12 py-8', className)}>
      <div className="absolute inset-x-6 top-2.5 flex justify-between" aria-hidden="true">
        {row(0)}
      </div>
      <div className="absolute inset-x-6 bottom-2.5 flex justify-between" aria-hidden="true">
        {row(1)}
      </div>
      {children}
    </div>
  );
}

export function JoinQR({ url, size = 280, className }: { url: string; size?: number | string; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-white p-[4%] shadow-md', className)}>
      <QRCodeSVG value={url} level="M" marginSize={2} style={{ width: size, height: size }} bgColor="#FFFFFF" fgColor="#17153B" title="참여 QR 코드" />
    </div>
  );
}

/** Slowly drifting choice shapes behind lobby screens (8% opacity, CSS-only). */
export function ShapeDrift({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const shapes = ['#D92D20', '#1F5FE0', '#7B3FE4', '#108548', '#C74B0A', '#CB2A85'];
  if (reduce) return null;
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      {shapes.map((c, i) => (
        <span
          key={c}
          className="motion-loop absolute block animate-drift rounded-[30%] opacity-[0.08]"
          style={{
            background: c,
            width: `${3 + (i % 3)}rem`,
            height: `${3 + (i % 3)}rem`,
            left: `${8 + i * 15}%`,
            top: '105%',
            animationDuration: `${18 + i * 3}s`,
            animationDelay: `${-i * 4}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Circle that grows from a point to cover the screen (result reveal). Transform-only. */
export function RevealCircle({ color, origin = { x: '50%', y: '70%' } }: { color: string; origin?: { x: string; y: string } }) {
  return (
    <m.div
      className="pointer-events-none absolute size-[16px] rounded-full"
      style={{ background: color, left: origin.x, top: origin.y, marginLeft: -8, marginTop: -8 }}
      initial={{ scale: 0 }}
      animate={{ scale: 260 }}
      transition={{ duration: 0.45, ease: ease.standard }}
      aria-hidden="true"
    />
  );
}
