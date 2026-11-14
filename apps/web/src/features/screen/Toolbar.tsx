import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Maximize, Minimize, Moon, Sparkles, Sun, Volume2, VolumeX } from 'lucide-react';
import { usePrefs } from '@/stores/prefs';
import { useHotkeys } from '@/hooks/dom';
import { unlockAudio } from '@/design/sounds';
import { Logo } from '@/ui/display';
import { cn } from '@/lib/format';
import { formatCode } from './hooks';

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full transition-colors',
        active ? 'bg-spark-400 text-ink' : 'text-white/85 hover:bg-white/15',
      )}
    >
      {children}
    </button>
  );
}

/** Operator controls for the presenter window; hides itself (with the cursor) after 3s idle. */
export function Toolbar({ visible, title, code }: { visible: boolean; title: string; code: string }) {
  const { sound, reduceMotion, stageTheme, set } = usePrefs();
  const [fs, setFs] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const toggleSound = useCallback(() => {
    unlockAudio();
    set({ sound: !usePrefs.getState().sound });
  }, [set]);

  useHotkeys(
    useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') toggleSound();
        if (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') toggleFs();
      },
      [toggleSound, toggleFs],
    ),
  );

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/90 py-1.5 pr-2 pl-4 text-white shadow-lg"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
        >
          <Logo compact className="text-base" />
          <span className="max-w-[260px] truncate text-sm font-bold">{title}</span>
          <span className="tabular rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{formatCode(code)}</span>
          <span className="mx-1 h-6 w-px bg-white/20" />
          <ToolButton label={sound ? '소리 끄기 (M)' : '소리 켜기 (M)'} active={sound} onClick={toggleSound}>
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </ToolButton>
          <ToolButton
            label={stageTheme === 'stage' ? '밝은 테마' : '어두운 무대 테마'}
            onClick={() => set({ stageTheme: stageTheme === 'stage' ? 'light' : 'stage' })}
          >
            {stageTheme === 'stage' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </ToolButton>
          <ToolButton label="애니메이션 줄이기" active={reduceMotion} onClick={() => set({ reduceMotion: !reduceMotion })}>
            <Sparkles className="size-5" />
          </ToolButton>
          <ToolButton label={fs ? '전체 화면 끝내기 (F)' : '전체 화면 (F)'} onClick={toggleFs}>
            {fs ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </ToolButton>
        </m.div>
      )}
    </AnimatePresence>
  );
}
