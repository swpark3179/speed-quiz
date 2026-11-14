import type { Transition } from 'motion/react';

/** Motion tokens — every animation in the app pulls from here. */
export const dur = {
  instant: 0.08,
  fast: 0.15,
  base: 0.24,
  slow: 0.4,
  slower: 0.7,
  dramatic: 1.2,
} as const;

export const ease = {
  standard: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
  inOut: [0.65, 0, 0.35, 1],
  overshoot: [0.34, 1.56, 0.64, 1],
  count: [0.16, 1, 0.3, 1],
} as const satisfies Record<string, [number, number, number, number]>;

export const spring = {
  snappy: { type: 'spring', visualDuration: 0.18, bounce: 0.15 },
  pop: { type: 'spring', visualDuration: 0.35, bounce: 0.45 },
  bouncy: { type: 'spring', visualDuration: 0.55, bounce: 0.55 },
  layout: { type: 'spring', visualDuration: 0.5, bounce: 0.18 },
  gentle: { type: 'spring', visualDuration: 0.45, bounce: 0 },
  heavy: { type: 'spring', visualDuration: 0.8, bounce: 0.25 },
} as const satisfies Record<string, Transition>;

export const stagger = {
  list: 0.03,
  tiles: 0.06,
  podium: 0.3,
} as const;

/** Cap list staggers so long lists don't take forever. */
export function cappedStagger(i: number, step: number = stagger.list, cap = 0.36): number {
  return Math.min(i * step, cap);
}

/** Standard screen-level enter/exit used with AnimatePresence. */
export const screenVariants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: spring.gentle },
  exit: { opacity: 0, scale: 0.98, transition: { duration: dur.fast, ease: ease.exit } },
};

export const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: dur.base, ease: ease.standard } },
  exit: { opacity: 0, transition: { duration: dur.fast, ease: ease.exit } },
};
