import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { RosterEntry } from '@sq/shared';
import { spring } from '@/design/motion';
import { Avatar } from '@/ui/display';
import { cn, num } from '@/lib/format';

/**
 * Participants popping into the lobby. Joins are animated in a queue (40ms apart, ≤30 at once);
 * beyond `max` visible avatars we show "+N명".
 */
export function AvatarCloud({
  roster,
  total,
  meId,
  max = 60,
  size = 44,
  variant = 'chips',
  className,
}: {
  roster: RosterEntry[];
  total: number;
  meId?: number;
  max?: number;
  size?: number;
  variant?: 'chips' | 'avatars';
  className?: string;
}) {
  const visible = roster.slice(-max);
  const hidden = Math.max(0, total - visible.length);
  const seen = useRef(new Set<number>());
  const [first, setFirst] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setFirst(false), 50);
    return () => window.clearTimeout(t);
  }, []);
  let queue = 0;

  return (
    <ul className={cn('flex flex-wrap content-start justify-center gap-2', className)} aria-label={`참가자 ${total}명`}>
      <AnimatePresence initial={false}>
        {visible.map((p) => {
          const isNew = !first && !seen.current.has(p.id);
          seen.current.add(p.id);
          const delay = isNew ? Math.min(queue++, 30) * 0.04 : 0;
          return (
            <m.li
              key={p.id}
              layout="position"
              initial={isNew ? { scale: 0, y: 12, opacity: 0 } : false}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
              transition={{ ...spring.pop, delay, layout: spring.layout }}
              className={cn(
                'flex max-w-[12rem] items-center gap-2 rounded-full bg-surface py-1 pr-4 pl-1 shadow-xs ring-1 ring-line/70',
                variant === 'avatars' && 'pr-1',
                p.id === meId && 'ring-2 ring-spark-400',
              )}
              title={p.nickname}
            >
              <Avatar id={p.id} name={p.nickname} size={size} />
              {variant === 'chips' && <span className="truncate font-bold">{p.nickname}</span>}
            </m.li>
          );
        })}
      </AnimatePresence>
      {hidden > 0 && (
        <li className="flex items-center rounded-full bg-ink px-4 py-1 font-bold text-white">+{num(hidden)}명</li>
      )}
    </ul>
  );
}
