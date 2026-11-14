import { useMemo } from 'react';
import { htmlToText, type QuestionKind } from '@sq/shared';
import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/format';

export type QuestionVariant = 'mobile' | 'stage' | 'preview';

function fontFor(variant: QuestionVariant, len: number): string {
  if (variant === 'stage') {
    if (len <= 40) return '4rem';
    if (len <= 80) return '3.25rem';
    if (len <= 140) return '2.75rem';
    return '2.25rem';
  }
  if (len <= 40) return '1.3rem';
  if (len <= 80) return '1.15rem';
  if (len <= 140) return '1.06rem';
  return '1rem';
}

export function questionTextLength(kind: QuestionKind, body: string): number {
  return (kind === 'HTML' ? htmlToText(body) : body).length;
}

/** Renders a question body: sanitized HTML (DOMPurify, shared allowlist) or plain text (never parsed). */
export function QuestionBody({
  kind,
  body,
  imageUrl,
  variant,
  className,
}: {
  kind: QuestionKind;
  body: string;
  imageUrl?: string | null;
  variant: QuestionVariant;
  className?: string;
}) {
  const html = useMemo(() => (kind === 'HTML' ? sanitizeHtml(body) : null), [kind, body]);
  const len = questionTextLength(kind, body);
  const style = {
    '--q-font': fontFor(variant, len),
    '--q-img-max': variant === 'stage' ? '30rem' : variant === 'mobile' ? '22vh' : '16rem',
  } as React.CSSProperties;
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className={cn('rounded-md object-contain', variant === 'stage' ? 'max-h-[24rem]' : 'max-h-[22vh]')}
          loading="eager"
          decoding="async"
        />
      )}
      {html !== null ? (
        <div className="q-body w-full text-center" data-kind="HTML" style={style} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="q-body w-full text-center" data-kind="TEXT" style={style}>
          {body}
        </div>
      )}
    </div>
  );
}
