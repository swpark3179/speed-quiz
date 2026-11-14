import type { HTMLAttributes, ReactNode } from 'react';
import type { RoomStatus } from '@sq/shared';
import { avatarColor, cn, initial } from '@/lib/format';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg bg-surface shadow-sm ring-1 ring-line/60', className)} {...rest} />;
}

const badgeTone = {
  neutral: 'bg-n-100 text-n-700',
  info: 'bg-info-tint text-info-dark',
  success: 'bg-success-tint text-success-dark',
  warning: 'bg-warning-tint text-warning-text',
  danger: 'bg-danger-tint text-danger-text',
  ink: 'bg-ink text-white',
  spark: 'bg-spark-400 text-ink',
} as const;

export function Badge({
  tone = 'neutral',
  dot,
  pulse,
  children,
  className,
}: {
  tone?: keyof typeof badgeTone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', badgeTone[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full bg-current', pulse && 'motion-loop animate-pulse-soft')} aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS: Record<RoomStatus, { label: string; tone: keyof typeof badgeTone; pulse?: boolean }> = {
  DRAFT: { label: '작성 중', tone: 'neutral' },
  OPEN: { label: '대기 중', tone: 'info' },
  LIVE: { label: '진행 중', tone: 'success', pulse: true },
  ENDED: { label: '종료', tone: 'ink' },
};

export function StatusBadge({ status }: { status: RoomStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot pulse={s.pulse}>
      {s.label}
    </Badge>
  );
}

export function Avatar({
  id,
  name,
  size = 40,
  me,
  className,
}: {
  id: number;
  name: string;
  size?: number;
  me?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-ink select-none',
        me && 'ring-4 ring-spark-400 ring-offset-2 ring-offset-bg',
        className,
      )}
      style={{ width: size, height: size, background: avatarColor(id), fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-xs border border-b-2 border-line bg-surface px-1.5 font-mono text-xs font-bold text-fg-muted">
      {children}
    </kbd>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="text-n-400">{icon}</div>}
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="text-fg-muted">{children}</div>}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/** Lightning-bolt wordmark. */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-display text-xl tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="size-[1.6em]" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#17153B" />
        <path d="M36 6 14 36h14l-4 22 26-32H35l5-20z" fill="#FFC233" stroke="#FFC233" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {!compact && <span>스피드 퀴즈</span>}
    </span>
  );
}
