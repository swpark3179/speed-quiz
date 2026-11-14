import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Logical 1920×1080 stage (120rem × 67.5rem). html[data-stage] scales 1rem with the viewport,
 * so everything inside is laid out in rem and letterboxed to 16:9.
 */
export function Stage({ children, theme, className }: { children: ReactNode; theme: 'light' | 'stage'; className?: string }) {
  return (
    <div
      className={cn('fixed inset-0 flex items-center justify-center overflow-hidden', theme === 'stage' ? 'bg-stage-950' : 'bg-n-200')}
      data-theme={theme === 'stage' ? 'stage' : undefined}
    >
      <div
        className={cn('relative h-[67.5rem] w-[120rem] shrink-0 overflow-hidden text-fg', className)}
        style={{
          background:
            theme === 'stage'
              ? 'radial-gradient(ellipse at 50% 0%, #2A2566 0%, #110E2E 60%, #0B0920 100%)'
              : 'radial-gradient(ellipse 70% 55% at 50% -10%, #FFE08A 0%, rgba(255,224,138,0) 70%), radial-gradient(ellipse 50% 40% at 100% 110%, #E2D7FF 0%, rgba(226,215,255,0) 70%), #F5F4FA',
        }}
      >
        {children}
      </div>
    </div>
  );
}
