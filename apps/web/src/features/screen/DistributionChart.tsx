import { m } from 'motion/react';
import { Check } from 'lucide-react';
import type { PublicChoice } from '@sq/shared';
import { choiceMeta } from '@/design/choices';
import { spring } from '@/design/motion';
import { ChoiceShape } from '@/game/ChoiceShape';
import { CountUp } from '@/game/effects';
import { cn } from '@/lib/format';

export type RevealStage = 'build' | 'highlight' | 'stats';

/**
 * Answer distribution bars. Bars grow with scaleY (80ms stagger); at the highlight beat the correct
 * column scales up with a spark ring + check badge and the others dim to 35%.
 */
export function DistributionChart({
  choices,
  distribution,
  correctIds,
  stage,
  instant,
}: {
  choices: PublicChoice[];
  distribution: { choiceId: number; count: number }[];
  correctIds: number[];
  stage: RevealStage;
  instant?: boolean;
}) {
  const counts = new Map(distribution.map((d) => [d.choiceId, d.count]));
  const max = Math.max(1, ...distribution.map((d) => d.count));
  const highlighted = stage !== 'build';
  return (
    <div className="flex h-full min-h-0 items-stretch gap-[1.75rem]">
      {choices.map((c, i) => {
        const meta = choiceMeta(c.position);
        const count = counts.get(c.id) ?? 0;
        const correct = correctIds.includes(c.id);
        const ratio = count / max;
        return (
          <m.div
            key={c.id}
            className="relative flex min-w-0 flex-1 flex-col items-center"
            initial={false}
            animate={{
              opacity: highlighted && !correct ? 0.35 : 1,
              scale: highlighted && correct ? 1.06 : 1,
            }}
            transition={instant ? { duration: 0 } : spring.layout}
          >
            <div className="relative flex w-full flex-1 flex-col items-center justify-end">
              <CountUp
                value={count}
                from={instant ? count : 0}
                duration={0.9}
                delay={instant ? 0 : i * 0.08}
                className="mb-3 text-[3.5rem] leading-none font-black"
              />
              <div className="relative w-[78%]" style={{ height: `${Math.max(3, ratio * 100)}%` }}>
                <m.div
                  className="absolute inset-0 origin-bottom rounded-t-[1.25rem]"
                  style={{ background: meta.base, boxShadow: `inset 0 -0.6rem 0 ${meta.edge}` }}
                  initial={instant ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={instant ? { duration: 0 } : { ...spring.layout, delay: i * 0.08 }}
                />
                {highlighted && correct && (
                  <m.span
                    className={cn('absolute -top-[1.9rem] -right-[1.9rem] z-10 flex size-[3.75rem] items-center justify-center rounded-full bg-success text-white shadow-lg ring-4 ring-white')}
                    initial={instant ? false : { scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={spring.pop}
                    aria-label="정답"
                  >
                    <Check className="size-[2.4rem]" strokeWidth={4} />
                  </m.span>
                )}
                {highlighted && correct && (
                  <m.div
                    className="pointer-events-none absolute -inset-[0.6rem] rounded-t-[1.6rem] ring-[0.6rem] ring-spark-400"
                    initial={instant ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
            <div
              className="relative mt-4 flex w-full items-center gap-3 rounded-[1.25rem] px-4 py-3 text-white"
              style={{ background: meta.base }}
            >
              <ChoiceShape shape={meta.shape} className="size-[2.5rem] shrink-0" />
              <span className="line-clamp-2 min-w-0 flex-1 text-[1.6rem] leading-tight font-bold">{c.text}</span>
              <span
                className="flex size-[2.5rem] shrink-0 items-center justify-center rounded-full bg-white text-[1.5rem] font-black"
                style={{ color: meta.edge }}
              >
                {meta.number}
              </span>
            </div>
          </m.div>
        );
      })}
    </div>
  );
}
