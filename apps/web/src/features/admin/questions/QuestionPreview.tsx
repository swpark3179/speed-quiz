import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Users } from 'lucide-react';
import type { QuestionKind } from '@sq/shared';
import { ChoiceButton, ChoiceTile, isLongChoiceSet, phoneGridClass, phoneItemClass, stageItemSpan } from '@/game/choices';
import { QuestionBody } from '@/game/QuestionBody';
import { cn } from '@/lib/format';

export interface PreviewQuestion {
  kind: QuestionKind;
  body: string;
  imageUrl: string | null;
  choices: { text: string }[];
  timeLimitSec: number | null;
}

/** Scales a fixed-size box to the width of its container (static preview only). */
function Scaled({ width, height, children, className }: { width: number; height: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={cn('relative w-full min-w-0 overflow-hidden', className)} style={{ height: height * scale }}>
      {/* absolutely positioned so the fixed-size box never widens the layout */}
      <div className="absolute top-0 left-0" style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

/** The phone frame is a fixed 390px box, so viewport breakpoints (md:/lg:) must not apply inside it. */
const phoneOnly = (cls: string) =>
  cls
    .split(/\s+/)
    .filter((c) => !/^(sm|md|lg|xl|2xl):/.test(c))
    .join(' ');

export function PhonePreview({ q }: { q: PreviewQuestion }) {
  const texts = q.choices.map((c) => c.text || '보기 내용');
  const long = isLongChoiceSet(texts);
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <Scaled width={390} height={760}>
        <div className="flex h-[760px] w-[390px] flex-col overflow-hidden rounded-[44px] border-[10px] border-ink bg-bg shadow-lg">
          <div className="flex items-center justify-between px-5 pt-4 pb-2 text-sm font-bold">
            <span className="rounded-full bg-ink px-3 py-1 text-white">Q 1/10</span>
            <span className="tabular">1,950점</span>
          </div>
          <div className="mx-5 h-2.5 overflow-hidden rounded-full bg-n-200">
            <div className="h-full w-2/3 rounded-full bg-spark-400" />
          </div>
          <div className="fade-mask-y mx-4 mt-3 max-h-[38%] overflow-hidden rounded-lg bg-surface p-4 shadow-sm">
            {q.body.trim() || q.imageUrl ? (
              <QuestionBody kind={q.kind} body={q.body} imageUrl={q.imageUrl} variant="mobile" />
            ) : (
              <p className="py-6 text-center font-semibold text-n-400">문제 내용이 여기에 보여요</p>
            )}
          </div>
          <div className={cn('grid min-h-0 flex-1 gap-2.5 p-4', phoneOnly(phoneGridClass(texts.length, long)), long && 'overflow-hidden')}>
            {texts.map((t, i) => (
              <ChoiceButton key={i} position={i} text={t} state="idle" tabIndex={-1} className={phoneOnly(phoneItemClass(texts.length, i, long))} />
            ))}
          </div>
        </div>
      </Scaled>
    </div>
  );
}

export function StagePreview({ q }: { q: PreviewQuestion }) {
  const texts = q.choices.map((c) => c.text || '보기 내용');
  return (
    <Scaled width={1920} height={1080} className="overflow-hidden rounded-lg shadow-md ring-1 ring-line">
      <div className="flex h-[1080px] w-[1920px] flex-col gap-8 bg-bg p-16">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-ink px-8 py-3 text-[2rem] font-black text-white">Q 1 / 10</span>
          <span className="inline-flex items-center gap-3 text-[2rem] font-bold text-fg-muted">
            <Users className="size-10" /> 응답 0 / 40
          </span>
          <span className="flex size-40 items-center justify-center rounded-full border-[14px] border-spark-400 bg-surface text-[4rem] font-black">
            {q.timeLimitSec ?? 20}
          </span>
        </div>
        <div className="flex max-h-[45%] min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-surface px-16 py-10 shadow-md">
          {q.body.trim() || q.imageUrl ? (
            <QuestionBody kind={q.kind} body={q.body} imageUrl={q.imageUrl} variant="stage" className="w-full" />
          ) : (
            <p className="text-[3rem] font-bold text-n-300">문제 내용이 여기에 보여요</p>
          )}
        </div>
        <div className="grid flex-1 grid-cols-6 gap-6">
          {texts.map((t, i) => (
            <ChoiceTile key={i} position={i} text={t} className={stageItemSpan(texts.length, i)} />
          ))}
        </div>
      </div>
    </Scaled>
  );
}
