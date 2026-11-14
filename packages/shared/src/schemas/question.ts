import '../zod-ko';
import { z } from 'zod';
import { HTML_BODY_MAX, UPLOAD_URL_RE } from '../sanitize-policy';

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

export const QuestionKind = z.enum(['TEXT', 'HTML']);
export type QuestionKind = z.infer<typeof QuestionKind>;

export const ChoiceInput = z.object({
  text: z.string().trim().min(1, '보기 내용을 입력해 주세요.').max(120, '보기는 120자 이내로 입력해 주세요.'),
  isCorrect: z.boolean(),
});
export type ChoiceInput = z.infer<typeof ChoiceInput>;

export const QuestionInput = z
  .object({
    kind: QuestionKind,
    title: z.string().trim().max(100).default(''),
    body: z.string().trim().min(1, '문제 내용을 입력해 주세요.').max(HTML_BODY_MAX),
    imageUrl: z.string().regex(UPLOAD_URL_RE).nullable().default(null),
    timeLimitSec: z.number().int().min(5).max(300).nullable().default(null),
    explanation: z.string().trim().max(500).nullable().default(null),
    tags: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
    /** public questions are visible (read-only) to other admins; private ones only to their creator */
    isPublic: z.boolean().default(false),
    choices: z.array(ChoiceInput).min(MIN_CHOICES, '보기는 2개 이상이어야 해요.').max(MAX_CHOICES, '보기는 최대 6개까지예요.'),
  })
  .superRefine((q, ctx) => {
    const correct = q.choices.filter((c) => c.isCorrect).length;
    if (correct !== 1) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: '정답을 하나 선택해 주세요.' });
    }
  });
export type QuestionInput = z.input<typeof QuestionInput>;
export type QuestionInputParsed = z.output<typeof QuestionInput>;

export interface ChoiceDto {
  id: number;
  position: number;
  text: string;
  isCorrect: boolean;
}

export interface QuestionDto {
  id: number;
  kind: QuestionKind;
  title: string;
  body: string;
  imageUrl: string | null;
  timeLimitSec: number | null;
  explanation: string | null;
  tags: string[];
  version: number;
  choices: ChoiceDto[];
  isPublic: boolean;
  /** true when the viewing admin created the question (only then it is editable) */
  mine: boolean;
  ownerName: string | null;
  createdAt: number;
  updatedAt: number;
  updatedByName: string | null;
}

export interface QuestionListItem {
  id: number;
  kind: QuestionKind;
  title: string;
  preview: string;
  choiceCount: number;
  timeLimitSec: number | null;
  tags: string[];
  hasImage: boolean;
  isPublic: boolean;
  mine: boolean;
  ownerName: string | null;
  updatedAt: number;
}

export const QuestionListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  kind: QuestionKind.optional(),
  tag: z.string().trim().max(20).optional(),
  /** all = mine + public from others, mine = only mine, public = only public from others */
  scope: z.enum(['all', 'mine', 'public']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
