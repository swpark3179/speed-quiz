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
    /** the creator's own question group (folder); null = not grouped */
    groupId: z.number().int().positive().nullable().default(null),
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
  groupId: number | null;
  groupName: string | null;
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
  groupId: number | null;
  groupName: string | null;
  updatedAt: number;
}

export const QuestionListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  kind: QuestionKind.optional(),
  tag: z.string().trim().max(20).optional(),
  /** all = mine + public from others, mine = only mine, public = only public from others */
  scope: z.enum(['all', 'mine', 'public']).default('all'),
  /** only questions of this group, in group order */
  groupId: z.coerce.number().int().positive().optional(),
  /** only questions that belong to no group ('1' / 'true'; z.coerce.boolean would read 'false' as true) */
  ungrouped: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Filters shared by the question list and the group list (no paging). */
export const QuestionGroupListQuery = QuestionListQuery.pick({ q: true, kind: true, tag: true, scope: true });
export type QuestionFilters = { q?: string; kind?: QuestionKind; tag?: string; scope?: 'all' | 'mine' | 'public' };

export const QuestionGroupInput = z.object({
  name: z.string().trim().min(1, '그룹 이름을 입력해 주세요.').max(40, '그룹 이름은 40자 이내로 입력해 주세요.'),
});
export type QuestionGroupInput = z.input<typeof QuestionGroupInput>;

export interface QuestionGroupDto {
  id: number;
  name: string;
  /** questions in the group the viewer can see */
  questionCount: number;
  /** of those, how many are public */
  publicCount: number;
  /** of those, how many match the current list filters (= questionCount without filters) */
  matchCount: number;
  /** ids of the questions the viewer can see, in group order (ignores the list filters) */
  questionIds: number[];
  /** true when the viewer owns the group (only then it can be renamed, reordered or deleted) */
  mine: boolean;
  ownerName: string | null;
  createdAt: number;
  updatedAt: number;
}

const idList = (max: number) => z.array(z.number().int().positive()).min(1, '문제를 선택해 주세요.').max(max);

export const MoveQuestionsInput = z.object({
  questionIds: idList(200),
  /** null takes the questions out of their group */
  groupId: z.number().int().positive().nullable(),
});
export type MoveQuestionsInput = z.input<typeof MoveQuestionsInput>;

export const GroupOrderInput = z.object({ questionIds: z.array(z.number().int().positive()).max(1000) });
export type GroupOrderInput = z.input<typeof GroupOrderInput>;

export const GroupVisibilityInput = z.object({ isPublic: z.boolean() });
export type GroupVisibilityInput = z.input<typeof GroupVisibilityInput>;
