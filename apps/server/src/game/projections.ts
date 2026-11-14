import type { PublicQuestion, QuestionKind, CloseReason } from '@sq/shared';

/**
 * Engine-internal question snapshot (contains the correct answers).
 * Anything sent to participants / screens must be built with the explicit projections below —
 * never spread an RQ into a payload.
 */
export interface RQ {
  id: number;
  position: number;
  kind: QuestionKind;
  title: string;
  body: string;
  imageUrl: string | null;
  explanation: string | null;
  timeLimitMs: number;
  multiplier: number;
  choices: { id: number; position: number; text: string; isCorrect: boolean }[];
  correctIds: Set<number>;
  startedAt: number | null;
  opensAt: number | null;
  endsAt: number | null;
  closedAt: number | null;
  closeReason: CloseReason | null;
}

export function publicQuestion(q: RQ, total: number, includeBody: boolean): PublicQuestion {
  return {
    roomQuestionId: q.id,
    index: q.position,
    total,
    kind: q.kind,
    body: includeBody ? q.body : '',
    imageUrl: includeBody ? q.imageUrl : null,
    choices: q.choices.map((c) => ({ id: c.id, position: c.position, text: c.text })),
    timeLimitMs: q.timeLimitMs,
  };
}

export function previewText(kind: QuestionKind, body: string, max = 80): string {
  const text = kind === 'HTML' ? body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ') : body;
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
