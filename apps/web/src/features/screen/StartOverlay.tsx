import { useEffect } from 'react';
import { m } from 'motion/react';
import { Play } from 'lucide-react';
import { unlockAudio } from '@/design/sounds';
import { spring } from '@/design/motion';
import { Logo } from '@/ui/display';

/** First interaction: unlocks audio and enters fullscreen (browsers require a user gesture for both). */
export function StartOverlay({ title, onStart }: { title: string; onStart: () => void }) {
  const start = () => {
    unlockAudio();
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    onStart();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <m.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-ink/92 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <Logo className="text-[3rem] text-white" />
      <p className="max-w-[70rem] truncate text-center text-[2.5rem] font-bold text-stage-muted">{title}</p>
      <m.button
        type="button"
        onClick={start}
        className="group flex items-center gap-5 rounded-[2rem] bg-spark-600 font-display text-[3.5rem] text-ink outline-none"
        whileTap={{ scale: 0.97 }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring.pop}
        autoFocus
      >
        <span className="flex items-center gap-5 rounded-[2rem] bg-spark-400 px-14 py-6 transition-transform group-active:translate-y-0 -translate-y-2">
          <Play className="size-[3.5rem] fill-ink" />
          시작하기
        </span>
      </m.button>
      <p className="text-[1.5rem] text-stage-muted">클릭하거나 Enter를 누르면 효과음과 전체 화면이 켜져요</p>
    </m.div>
  );
}
