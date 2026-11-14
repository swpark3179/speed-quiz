import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { screenVariants } from '@/design/motion';
import { Logo } from '@/ui/display';
import { ShapeDrift } from '@/game/effects';

/** Shared backdrop + card for the admin login and sign-up screens. */
export function AuthShell({ subtitle, children, footer }: { subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-spark-400 px-4 py-10">
      <ShapeDrift />
      <m.div
        variants={screenVariants}
        initial="initial"
        animate="animate"
        className="relative w-full max-w-[420px] rounded-xl bg-surface p-7 shadow-lg md:p-8"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="text-2xl" />
          <p className="font-semibold text-fg-muted">{subtitle}</p>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-fg-muted">{footer}</div>}
      </m.div>
    </div>
  );
}
