import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { WifiOff } from 'lucide-react';
import type { ConnStatus } from '@/stores/useGameSocket';
import { Spinner } from '@/ui/display';
import { spring } from '@/design/motion';

/** Banner after 1s offline; blocking overlay after 5s while a question is open. */
export function ConnectionOverlay({ status, critical }: { status: ConnStatus; critical: boolean }) {
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const down = status !== 'connected';

  useEffect(() => {
    setSince(down ? Date.now() : null);
  }, [down]);

  useEffect(() => {
    if (!down) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [down]);

  const elapsed = since ? now - since : 0;
  const showBanner = down && elapsed > 1000;
  const showOverlay = down && critical && elapsed > 5000;

  return (
    <>
      <AnimatePresence>
        {showBanner && !showOverlay && (
          <m.div
            role="status"
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            transition={spring.gentle}
            className="pt-safe fixed inset-x-0 top-0 z-(--z-overlay) flex items-center justify-center gap-2 bg-ink px-4 pb-2 text-sm font-bold text-white"
          >
            <Spinner className="size-4" />
            {status === 'connecting' ? '연결하는 중…' : '다시 연결하는 중…'}
          </m.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showOverlay && (
          <m.div
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-(--z-overlay) flex flex-col items-center justify-center gap-4 bg-ink/85 p-8 text-center text-white"
          >
            <WifiOff className="size-12 text-spark-400" />
            <p className="font-display text-3xl">다시 연결 중…</p>
            <p className="text-white/80">네트워크가 잠시 끊겼어요. 연결되면 바로 이어서 참여할 수 있어요.</p>
            <Spinner className="size-7" />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
