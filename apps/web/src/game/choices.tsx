import { m, type HTMLMotionProps } from 'motion/react';
import { Check, X } from 'lucide-react';
import { choiceLabel, choiceMeta } from '@/design/choices';
import { spring } from '@/design/motion';
import { cn } from '@/lib/format';
import { ChoiceShape } from './ChoiceShape';

export type ChoiceState = 'idle' | 'selected' | 'dimmed' | 'disabled' | 'correct' | 'wrong' | 'other';

export function choiceFontPx(text: string): number {
  const n = [...text].length;
  if (n <= 12) return 22;
  if (n <= 24) return 20;
  if (n <= 40) return 18;
  return 16;
}

/** Switch to the one-column list when text would not fit a tile (smaller tiles with 5–6 choices). */
export function isLongChoiceSet(texts: string[]): boolean {
  const limit = texts.length >= 5 ? 22 : 40;
  return texts.some((t) => [...t].length > limit);
}

/**
 * Grid placement for 2–6 choices. Red/green and blue/violet sit on diagonals.
 * Uses container queries (the parent must be `@container`), so editor previews and the dev gallery
 * lay out exactly like a phone of the same width.
 */
export function phoneGridClass(count: number, long: boolean): string {
  if (long) return 'grid-cols-1 auto-rows-[minmax(64px,auto)]'; // rows grow with text; grid scrolls if needed
  switch (count) {
    case 2:
      return 'grid-cols-1 grid-rows-2 @3xl:grid-cols-2 @3xl:grid-rows-1';
    case 3:
    case 4:
      return 'grid-cols-2 grid-rows-2';
    default:
      return 'grid-cols-2 grid-rows-3 @3xl:grid-cols-3 @3xl:grid-rows-2';
  }
}

export function phoneItemClass(count: number, index: number, long: boolean): string {
  if (long) return '';
  if (count === 3 && index === 2) return 'col-span-2';
  if (count === 5 && index === 4) return 'col-span-2 @3xl:col-span-1';
  return '';
}

/** Presenter: 6-column grid so 5 choices can be 3 + 2. */
export function stageItemSpan(count: number, index: number): string {
  if (count === 2 || count === 4) return 'col-span-3';
  if (count === 3 || count === 6) return 'col-span-2';
  if (count === 5) return index < 3 ? 'col-span-2' : 'col-span-3';
  return 'col-span-2';
}

interface ChoiceButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  position: number;
  text: string;
  state: ChoiceState;
  onSelect?: () => void;
  kbdHint?: boolean;
  /** one-column list layout for long texts: shape left, text left-aligned */
  row?: boolean;
}

/** Big participant answer button ("arcade key" with colour + shape + number + text). */
export function ChoiceButton({ position, text, state, onSelect, kbdHint, row, className, ...rest }: ChoiceButtonProps) {
  const meta = choiceMeta(position);
  const interactive = state === 'idle';
  const dim = state === 'dimmed' || state === 'other' || state === 'disabled';
  return (
    <m.button
      type="button"
      onClick={interactive ? onSelect : undefined}
      aria-disabled={!interactive}
      aria-pressed={state === 'selected' || undefined}
      aria-label={`${choiceLabel(position)}: ${text}`}
      className={cn(
        'group relative flex min-h-[72px] w-full rounded-lg no-tap focus-ring-tile',
        interactive ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
      style={{ background: meta.edge }}
      initial={false}
      animate={{
        opacity: dim ? 0.35 : 1,
        scale: state === 'selected' ? [1, 1.04, 1] : state === 'dimmed' || state === 'other' ? 0.97 : 1,
      }}
      transition={{ opacity: { duration: 0.15 }, scale: state === 'selected' ? { duration: 0.32 } : spring.snappy }}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      {...rest}
    >
      <span
        className={cn(
          'relative flex w-full flex-1 items-center overflow-hidden rounded-lg text-white transition-transform duration-75',
          row ? 'justify-start py-3 pr-12 pl-14 text-left' : 'justify-center px-4 pt-9 pb-5 text-center',
          interactive ? '-translate-y-1.5 group-active:-translate-y-0.5' : '-translate-y-0.5',
        )}
        style={{ background: meta.base }}
      >
        <ChoiceShape
          shape={meta.shape}
          className={cn('absolute size-7 drop-shadow-sm', row ? 'top-1/2 left-4 -translate-y-1/2' : 'top-3 left-3')}
        />
        <span
          className={cn(
            'absolute flex size-7 items-center justify-center rounded-full bg-white text-sm font-black',
            row ? 'top-1/2 right-3 -translate-y-1/2' : 'top-3 right-3',
          )}
          style={{ color: meta.edge }}
          aria-hidden="true"
        >
          {meta.number}
        </span>
        <span className="leading-snug font-bold [text-wrap:balance]" style={{ fontSize: row ? ([...text].length > 30 ? 16 : 18) : choiceFontPx(text) }}>
          {text}
        </span>
        {kbdHint && interactive && !row && (
          <span className="absolute bottom-2 left-1/2 hidden -translate-x-1/2 text-xs font-bold text-white/70 pointer-fine:block">
            키보드 {meta.number}
          </span>
        )}
        {state === 'correct' && (
          <span className="absolute -top-3 -right-3 flex size-9 items-center justify-center rounded-full bg-white text-success shadow-md">
            <Check className="size-6" strokeWidth={3.5} />
          </span>
        )}
        {state === 'wrong' && (
          <span className="absolute -top-3 -right-3 flex size-9 items-center justify-center rounded-full bg-white text-danger shadow-md">
            <X className="size-6" strokeWidth={3.5} />
          </span>
        )}
      </span>
    </m.button>
  );
}

/** Presenter tile (not interactive). Font sizes in rem so they scale with the stage. */
export function ChoiceTile({
  position,
  text,
  state = 'idle',
  count,
  className,
}: {
  position: number;
  text: string;
  state?: 'idle' | 'correct' | 'other';
  count?: number;
  className?: string;
}) {
  const meta = choiceMeta(position);
  const len = [...text].length;
  const size = len <= 16 ? 'text-[2.75rem]' : len <= 36 ? 'text-[2.25rem]' : 'text-[1.875rem]';
  return (
    <m.div
      className={cn('relative flex rounded-xl', className)}
      style={{ background: meta.edge }}
      initial={false}
      animate={{ opacity: state === 'other' ? 0.35 : 1, scale: state === 'correct' ? 1.04 : state === 'other' ? 0.97 : 1 }}
      transition={spring.layout}
    >
      {state === 'correct' && (
        <m.span
          className="pointer-events-none absolute -inset-2 rounded-[2.1rem] ring-[0.6rem] ring-spark-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          aria-hidden="true"
        />
      )}
      <div
        className="relative flex w-full -translate-y-[0.4rem] items-center gap-6 rounded-xl px-8 py-6 text-white"
        style={{ background: meta.base }}
      >
        <ChoiceShape shape={meta.shape} className="size-16 shrink-0" />
        <span className={cn('flex-1 leading-tight font-bold [text-wrap:balance]', size)}>{text}</span>
        {count !== undefined && <span className="tabular text-[2.75rem] font-black">{count}</span>}
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-[1.75rem] font-black"
          style={{ color: meta.edge }}
        >
          {state === 'correct' ? <Check className="size-8" strokeWidth={4} /> : meta.number}
        </span>
      </div>
    </m.div>
  );
}
