import type { Result } from './errors';
import type { Phase, ControlType, PrimaryAction } from './phases';
import type { QuestionKind } from './schemas/question';
import type { RoomSettings } from './schemas/settings';
import type { CeremonyKind } from './ceremony';

/** Every phase event carries the room state version and the server time it was produced. */
export interface Ver {
  v: number;
  at: number;
}

export type CloseReason = 'TIMER' | 'MANUAL' | 'ALL_ANSWERED';
export type ScreenView = 'AUTO' | 'JOIN_QR';

export interface PublicChoice {
  id: number;
  position: number;
  text: string;
}

export interface PublicQuestion {
  roomQuestionId: number;
  index: number;
  total: number;
  kind: QuestionKind;
  body: string;
  imageUrl: string | null;
  choices: PublicChoice[];
  timeLimitMs: number;
}

export interface QuestionTiming {
  startedAt: number;
  opensAt: number;
  endsAt: number;
}

export interface RosterEntry {
  id: number;
  nickname: string;
}

export interface RosterDelta {
  added: RosterEntry[];
  removed: number[];
  count: number;
}

export interface ProgressPayload {
  roomQuestionId: number;
  answeredCount: number;
  activeCount: number;
}

export interface QuestionStartPayload extends Ver {
  question: PublicQuestion;
  timing: QuestionTiming;
  activeCount: number;
}

export interface RevealPayload extends Ver {
  roomQuestionId: number;
  index: number;
  correctChoiceIds: number[];
  distribution: { choiceId: number; count: number }[];
  answeredCount: number;
  activeCount: number;
  correctCount: number;
  closeReason: CloseReason;
  explanation: string | null;
  fastest: { nickname: string; elapsedMs: number }[];
}

export interface YouResult {
  roomQuestionId: number;
  answered: boolean;
  choiceId: number | null;
  correct: boolean;
  points: number;
  correctRank: number | null;
  elapsedMs: number | null;
  totalScore: number;
  rank: number;
  prevRank: number | null;
  total: number;
  streak: number;
}

export interface LeaderboardEntry {
  participantId: number;
  nickname: string;
  score: number;
  rank: number;
  prevRank: number | null;
  /** points gained in the last question */
  delta: number;
  correctCount: number;
}

export interface LeaderboardPayload extends Ver {
  afterIndex: number;
  total: number;
  top: LeaderboardEntry[];
}

/** Always-visible mini ranking on phones (top N after each closed question). */
export const STANDINGS_SIZE = 5;

export interface StandingEntry {
  participantId: number;
  nickname: string;
  score: number;
  rank: number;
}

export interface StandingsPayload extends Ver {
  top: StandingEntry[];
  /** number of ranked participants */
  total: number;
}

export interface FinalResultsPayload extends Ver {
  /** number of prize winners that will be revealed in the ceremony */
  winnerCount: number;
  totalParticipants: number;
  /** ranks beyond the prize winners (screen only; empty for phones) */
  ranksBeyondPrize: LeaderboardEntry[];
  stats: { questions: number; avgCorrectRate: number };
}

export interface PrizeRevealPayload extends Ver {
  rank: number;
  participantId: number;
  nickname: string;
  score: number;
  correctCount: number;
  kind: CeremonyKind;
  /** absolute server time when the card should start its reveal step */
  startAt: number;
  /** absolute server time when the card flips (winner's phone celebrates at this moment) */
  flipAt: number;
  revealedCount: number;
  winnerCount: number;
  first: boolean;
}

export interface GameEndedPayload extends Ver {
  winners: { rank: number; participantId: number; nickname: string; score: number }[];
  top: LeaderboardEntry[];
}

export interface YouFinal {
  rank: number;
  score: number;
  correctCount: number;
  total: number;
  isWinner: boolean;
  bestStreak: number;
}

export interface RoomPublicInfo {
  id: number;
  title: string;
  code: string;
  phase: Phase;
  total: number;
  currentIndex: number;
  prizeCount: number;
  showQuestionOnDevices: boolean;
  showLeaderboardAfterEach: boolean;
  leaderboardSize: number;
}

export interface CurrentQuestionState {
  question: PublicQuestion;
  timing: QuestionTiming;
  answeredCount: number;
  activeCount: number;
}

export interface PlaySnapshot extends Ver {
  room: RoomPublicInfo;
  me: { id: number; nickname: string; score: number; correctCount: number; streak: number };
  roster: RosterEntry[];
  rosterCount: number;
  current: (CurrentQuestionState & { myAnswer: { choiceId: number; receivedAt: number } | null }) | null;
  reveal: RevealPayload | null;
  you: YouResult | null;
  leaderboard: LeaderboardPayload | null;
  /** null before the first question closes, when the host hides rankings, and during the ceremony */
  standings: (StandingsPayload & { myRank: number | null }) | null;
  final: FinalResultsPayload | null;
  prizes: PrizeRevealPayload[];
  ended: GameEndedPayload | null;
  youFinal: YouFinal | null;
}

export interface ScreenSnapshot extends Ver {
  room: RoomPublicInfo & { joinUrl: string };
  roster: RosterEntry[];
  rosterCount: number;
  current: CurrentQuestionState | null;
  reveal: RevealPayload | null;
  leaderboard: LeaderboardPayload | null;
  final: FinalResultsPayload | null;
  prizes: PrizeRevealPayload[];
  ended: GameEndedPayload | null;
  view: ScreenView;
}

export interface AdminQuestionBrief {
  roomQuestionId: number;
  index: number;
  kind: QuestionKind;
  title: string;
  preview: string;
  choices: { id: number; position: number; text: string; isCorrect: boolean }[];
  timeLimitMs: number;
  multiplier: number;
  closed: boolean;
  closeReason: CloseReason | null;
}

export interface AdminParticipant {
  id: number;
  nickname: string;
  connected: boolean;
  score: number;
  rank: number;
  correctCount: number;
  answeredCurrent: boolean;
  joinedAt: number;
}

export interface AdminLive {
  roomQuestionId: number;
  answeredCount: number;
  activeCount: number;
  correctCount: number;
  distribution: { choiceId: number; count: number }[];
  recent: { nickname: string; correct: boolean; elapsedMs: number }[];
}

export interface AdminSnapshot extends Ver {
  room: {
    id: number;
    title: string;
    code: string;
    phase: Phase;
    total: number;
    currentIndex: number;
    settings: RoomSettings;
    prizesRevealed: number;
    winnerCount: number;
    joinUrl: string;
    presenterUrl: string;
    screenView: ScreenView;
  };
  questions: AdminQuestionBrief[];
  current: (CurrentQuestionState & { correctChoiceIds: number[] }) | null;
  live: AdminLive | null;
  reveal: RevealPayload | null;
  participants: AdminParticipant[];
  winners: { rank: number; participantId: number; nickname: string; score: number }[];
  prizes: PrizeRevealPayload[];
  availableActions: ControlType[];
  primary: PrimaryAction | null;
}

export type ControlCommand =
  | { roomId: number; type: 'START_QUESTION'; index: number }
  | { roomId: number; type: 'CLOSE_QUESTION'; roomQuestionId: number }
  | { roomId: number; type: 'SHOW_LEADERBOARD'; index: number }
  | { roomId: number; type: 'FINISH' }
  | { roomId: number; type: 'REVEAL_PRIZE'; rank: number }
  | { roomId: number; type: 'END' }
  | { roomId: number; type: 'RESET' }
  | { roomId: number; type: 'ABORT' }
  | { roomId: number; type: 'KICK'; participantId: number }
  | { roomId: number; type: 'SCREEN_VIEW'; view: ScreenView };

export type Ack<T> = (r: Result<T>) => void;

/* ---------- /play ---------- */
export interface PlayServerToClient {
  'state:sync': (s: PlaySnapshot) => void;
  'roster:delta': (d: RosterDelta) => void;
  'question:start': (p: QuestionStartPayload) => void;
  'question:progress': (p: ProgressPayload) => void;
  'question:reveal': (p: RevealPayload) => void;
  'you:result': (p: YouResult) => void;
  'leaderboard:show': (p: LeaderboardPayload) => void;
  'standings:update': (p: StandingsPayload) => void;
  'game:final': (p: FinalResultsPayload) => void;
  'prize:reveal': (p: PrizeRevealPayload) => void;
  'game:ended': (p: GameEndedPayload) => void;
  'you:final': (p: YouFinal) => void;
  'session:kicked': () => void;
  'session:replaced': () => void;
  'room:reset': (p: Ver) => void;
}
export interface PlayClientToServer {
  'time:ping': (ack: (serverNow: number) => void) => void;
  'state:get': (ack: Ack<PlaySnapshot>) => void;
  'answer:submit': (p: { roomQuestionId: number; choiceId: number }, ack: Ack<{ receivedAt: number; choiceId: number }>) => void;
  /** Change my nickname (lobby only). */
  'me:rename': (p: { nickname: string }, ack: Ack<{ nickname: string }>) => void;
}

/* ---------- /screen ---------- */
export interface ScreenServerToClient {
  'state:sync': (s: ScreenSnapshot) => void;
  'roster:delta': (d: RosterDelta) => void;
  'question:start': (p: QuestionStartPayload) => void;
  'question:progress': (p: ProgressPayload) => void;
  'question:reveal': (p: RevealPayload) => void;
  'leaderboard:show': (p: LeaderboardPayload) => void;
  'game:final': (p: FinalResultsPayload) => void;
  'prize:reveal': (p: PrizeRevealPayload) => void;
  'game:ended': (p: GameEndedPayload) => void;
  'screen:view': (p: { view: ScreenView }) => void;
  'room:reset': (p: Ver) => void;
}
export interface ScreenClientToServer {
  'time:ping': (ack: (serverNow: number) => void) => void;
  'state:get': (ack: Ack<ScreenSnapshot>) => void;
}

/* ---------- /admin ---------- */
export interface AdminServerToClient {
  'admin:state': (s: AdminSnapshot) => void;
  'admin:live': (l: AdminLive) => void;
  'admin:roster': (p: { roomId: number; participants: AdminParticipant[] }) => void;
}
export interface AdminClientToServer {
  'time:ping': (ack: (serverNow: number) => void) => void;
  'room:watch': (p: { roomId: number }, ack: Ack<AdminSnapshot>) => void;
  'room:unwatch': (p: { roomId: number }) => void;
  control: (cmd: ControlCommand, ack: Ack<AdminSnapshot>) => void;
}
