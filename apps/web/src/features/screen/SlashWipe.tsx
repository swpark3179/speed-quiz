import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { ease } from '@/design/motion';
import { sfx } from '@/design/sounds';

/**
 * Scene transition: a diagonal spark band sweeps across the stage (500ms); the old scene is held
 * until the band covers the centre (250ms) and the new scene is revealed behind it.
 * Reduced motion → plain crossfade.
 */
export function SlashWipe({ sceneKey, children }: { sceneKey: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [wipe, setWipe] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!reduce) {
      setWipe((w) => w + 1);
      sfx.whoosh();
    }
  }, [sceneKey, reduce]);

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={sceneKey}
          className="absolute inset-0"
          initial={reduce ? { opacity: 0 } : { opacity: 1 }}
          animate={{ opacity: 1, transition: { duration: reduce ? 0.2 : 0 } }}
          exit={reduce ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, transition: { duration: 0.01, delay: 0.24 } }}
        >
          {children}
        </m.div>
      </AnimatePresence>
      <AnimatePresence>
        {wipe > 0 && (
          <m.div
            key={wipe}
            className="pointer-events-none absolute inset-y-[-20rem] left-1/2 z-30 w-[170rem] -ml-[85rem]"
            initial={{ x: '-140%' }}
            animate={{ x: '140%' }}
            transition={{ duration: 0.5, ease: ease.inOut }}
            onAnimationComplete={() => setWipe(0)}
            aria-hidden="true"
          >
            <div className="flex h-full -skew-x-[18deg]">
              <div className="h-full w-[6rem] bg-ink" />
              <div className="h-full flex-1 bg-spark-400" />
              <div className="h-full w-[3rem] bg-spark-600" />
              <div className="h-full w-[6rem] bg-ink" />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
