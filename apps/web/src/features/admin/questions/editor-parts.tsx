import { useId, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Bold, Check, Heading, Highlighter, ImagePlus, List, Plus, Trash2, WrapText, X } from 'lucide-react';
import { MAX_CHOICES, MIN_CHOICES } from '@sq/shared';
import { choiceMeta } from '@/design/choices';
import { spring } from '@/design/motion';
import { ChoiceShape } from '@/game/ChoiceShape';
import { errorText, uploadImage } from '@/lib/api';
import { cn } from '@/lib/format';
import { Button, IconButton } from '@/ui/Button';
import { Spinner } from '@/ui/display';

export interface ChoiceDraft {
  key: number;
  text: string;
  isCorrect: boolean;
}

let keySeq = 1;
export const newChoiceKey = () => keySeq++;

export function ChoiceEditor({
  choices,
  onChange,
  error,
}: {
  choices: ChoiceDraft[];
  onChange: (c: ChoiceDraft[]) => void;
  error?: string | null;
}) {
  const groupId = useId();
  const move = (i: number, d: -1 | 1) => {
    const next = [...choices];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-2.5" aria-describedby={error ? `${groupId}-err` : undefined}>
      <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-bold">
        <span>보기 ({choices.length}/{MAX_CHOICES})</span>
        <span className="text-xs font-semibold text-fg-muted">정답을 하나 골라 주세요</span>
      </legend>
      <ul className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {choices.map((c, i) => {
            const meta = choiceMeta(i);
            return (
              <m.li
                key={c.key}
                layout="position"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={spring.layout}
                className={cn(
                  'flex items-center gap-2 rounded-md bg-surface p-2 ring-2 transition-colors',
                  c.isCorrect ? 'ring-success' : 'ring-line/70',
                )}
              >
                <span
                  className="flex h-12 w-14 shrink-0 items-center justify-center gap-1 rounded-sm text-white"
                  style={{ background: meta.base }}
                  title={`${meta.number}번 ${meta.shapeLabel}`}
                >
                  <ChoiceShape shape={meta.shape} className="size-5" />
                  <span className="text-sm font-black">{meta.number}</span>
                </span>
                <div className="relative min-w-0 flex-1">
                  <input
                    value={c.text}
                    maxLength={120}
                    onChange={(e) => onChange(choices.map((x) => (x.key === c.key ? { ...x, text: e.target.value } : x)))}
                    placeholder={`${meta.number}번 보기`}
                    aria-label={`${meta.number}번 보기 내용`}
                    className="h-12 w-full rounded-sm border-2 border-transparent bg-n-50 pr-14 pl-3 font-semibold outline-none focus:border-info focus:bg-surface"
                  />
                  <span className="tabular pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-n-400">
                    {[...c.text].length}/120
                  </span>
                </div>
                <button
                  type="button"
                  role="radio"
                  aria-checked={c.isCorrect}
                  aria-label={`${meta.number}번을 정답으로`}
                  onClick={() => onChange(choices.map((x) => ({ ...x, isCorrect: x.key === c.key })))}
                  className={cn(
                    'flex h-12 shrink-0 items-center gap-1 rounded-sm px-3 text-sm font-bold transition-colors',
                    c.isCorrect ? 'bg-success text-white' : 'bg-n-100 text-fg-muted hover:bg-success-tint hover:text-success-dark',
                  )}
                >
                  <Check className="size-4" strokeWidth={3} />
                  <span className="hidden sm:inline">정답</span>
                </button>
                <div className="hidden flex-col sm:flex">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="flex h-6 w-8 items-center justify-center rounded-xs text-fg-muted hover:bg-n-100 disabled:opacity-25"
                    aria-label="위로"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === choices.length - 1}
                    onClick={() => move(i, 1)}
                    className="flex h-6 w-8 items-center justify-center rounded-xs text-fg-muted hover:bg-n-100 disabled:opacity-25"
                    aria-label="아래로"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                </div>
                <IconButton
                  label="보기 삭제"
                  disabled={choices.length <= MIN_CHOICES}
                  onClick={() => onChange(choices.filter((x) => x.key !== c.key))}
                  className="hover:text-danger-text"
                >
                  <Trash2 className="size-5" />
                </IconButton>
              </m.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <Button
        variant="subtle"
        icon={<Plus className="size-5" />}
        disabled={choices.length >= MAX_CHOICES}
        onClick={() => onChange([...choices, { key: newChoiceKey(), text: '', isCorrect: false }])}
      >
        보기 추가
      </Button>
      {error && (
        <p id={`${groupId}-err`} role="alert" className="text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState('');
  const id = useId();
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').slice(0, 20);
    if (!t || tags.includes(t)) return;
    if (tags.length >= 10) {
      toast.error('태그는 10개까지 넣을 수 있어요.');
      return;
    }
    onChange([...tags, t]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        태그 <span className="font-semibold text-fg-muted">(쉼표나 엔터로 추가)</span>
      </label>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-md border-2 border-n-400/70 bg-surface px-2 py-1.5 focus-within:border-info focus-within:ring-4 focus-within:ring-info/15">
        {tags.map((t) => (
          <span key={t} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink pr-1 pl-3 text-sm font-bold text-white">
            #{t}
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded-full hover:bg-white/20"
              onClick={() => onChange(tags.filter((x) => x !== t))}
              aria-label={`${t} 태그 삭제`}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) {
              v.split(',').slice(0, -1).forEach(add);
              setText(v.split(',').pop() ?? '');
            } else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add(text);
              setText('');
            } else if (e.key === 'Backspace' && !text && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (text.trim()) {
              add(text);
              setText('');
            }
          }}
          placeholder={tags.length ? '' : '예: 회사소개, 신입사원'}
          className="h-9 min-w-[8rem] flex-1 bg-transparent px-1 outline-none"
        />
      </div>
    </div>
  );
}

/** Snippet toolbar for HTML bodies: wraps the current selection in the textarea. */
export function HtmlToolbar({ textareaRef, value, onChange }: { textareaRef: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insert = (before: string, after = '', placeholder = '') => {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const sel = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  };

  const tools = [
    { label: '굵게', icon: Bold, run: () => insert('<b>', '</b>', '굵은 글씨') },
    { label: '강조', icon: Highlighter, run: () => insert('<mark>', '</mark>', '강조') },
    { label: '제목', icon: Heading, run: () => insert('<h3>', '</h3>', '소제목') },
    { label: '목록', icon: List, run: () => insert('<ul>\n  <li>', '</li>\n  <li>항목</li>\n</ul>', '항목') },
    { label: '줄바꿈', icon: WrapText, run: () => insert('<br>\n') },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-t-md border-2 border-b-0 border-n-400/70 bg-n-50 p-1.5" role="toolbar" aria-label="HTML 서식">
      {tools.map(({ label, icon: Icon, run }) => (
        <button
          key={label}
          type="button"
          onClick={run}
          className="inline-flex h-9 items-center gap-1.5 rounded-xs px-2.5 text-sm font-bold text-n-700 hover:bg-surface hover:shadow-xs"
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="inline-flex h-9 items-center gap-1.5 rounded-xs px-2.5 text-sm font-bold text-n-700 hover:bg-surface hover:shadow-xs disabled:opacity-50"
      >
        {uploading ? <Spinner className="size-4" /> : <ImagePlus className="size-4" aria-hidden="true" />}
        이미지 삽입
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setUploading(true);
          try {
            const r = await uploadImage(file);
            const size = r.width && r.height ? ` width="${r.width}" height="${r.height}"` : '';
            insert(`<img src="${r.url}" alt=""${size}>`);
          } catch (err) {
            toast.error(errorText(err));
          } finally {
            setUploading(false);
          }
        }}
      />
    </div>
  );
}
