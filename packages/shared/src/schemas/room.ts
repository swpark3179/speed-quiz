import '../zod-ko';
import { z } from 'zod';
import { RoomSettings } from './settings';
import type { QuestionKind } from './question';
import type { Phase } from '../phases';

export const RoomItem = z.object({
  questionId: z.number().int().positive(),
  timeLimitSec: z.number().int().min(5).max(300).nullable().default(null),
  multiplier: z.number().min(0.5).max(5).default(1),
});
export type RoomItem = z.output<typeof RoomItem>;

export const MAX_ROOM_ITEMS = 100;

export const RoomInput = z.object({
  title: z.string().trim().min(1, '퀴즈방 이름을 입력해 주세요.').max(60),
  settings: RoomSettings,
  items: z.array(RoomItem).max(MAX_ROOM_ITEMS, `문제는 최대 ${MAX_ROOM_ITEMS}개까지 넣을 수 있어요.`).default([]),
});
export type RoomInput = z.input<typeof RoomInput>;

export type RoomStatus = 'DRAFT' | 'OPEN' | 'LIVE' | 'ENDED';

export function roomStatus(phase: Phase): RoomStatus {
  if (phase === 'DRAFT') return 'DRAFT';
  if (phase === 'LOBBY') return 'OPEN';
  if (phase === 'ENDED') return 'ENDED';
  return 'LIVE';
}

export interface RoomListItem {
  id: number;
  title: string;
  phase: Phase;
  status: RoomStatus;
  code: string | null;
  questionCount: number;
  participantCount: number;
  prizeCount: number;
  createdAt: number;
  updatedAt: number;
  createdByName: string | null;
}

export interface RoomDraftItemDto {
  questionId: number;
  timeLimitSec: number | null;
  multiplier: number;
  /** resolved from the bank (null when the question was deleted) */
  question: { id: number; kind: QuestionKind; title: string; preview: string; choiceCount: number; timeLimitSec: number | null } | null;
}

export interface RoomDetailDto {
  id: number;
  title: string;
  phase: Phase;
  status: RoomStatus;
  code: string | null;
  settings: RoomSettings;
  items: RoomDraftItemDto[];
  joinUrl: string | null;
  presenterUrl: string | null;
  participantCount: number;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface ConfirmResult {
  code: string;
  joinUrl: string;
  presenterUrl: string;
}

export interface RoomResultsDto {
  room: { id: number; title: string; phase: Phase; code: string | null; startedAt: number | null; finishedAt: number | null; prizeCount: number };
  ranking: {
    rank: number;
    participantId: number;
    nickname: string;
    score: number;
    correctCount: number;
    avgCorrectMs: number | null;
    isWinner: boolean;
  }[];
  questions: {
    index: number;
    kind: QuestionKind;
    title: string;
    preview: string;
    answeredCount: number;
    correctCount: number;
    avgElapsedMs: number | null;
    closed: boolean;
    choices: { id: number; position: number; text: string; isCorrect: boolean; count: number }[];
  }[];
}
