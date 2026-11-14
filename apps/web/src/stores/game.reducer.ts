import type {
  CurrentQuestionState,
  FinalResultsPayload,
  GameEndedPayload,
  LeaderboardPayload,
  PlaySnapshot,
  PrizeRevealPayload,
  ProgressPayload,
  QuestionStartPayload,
  RevealPayload,
  RoomPublicInfo,
  RosterDelta,
  RosterEntry,
  ScreenSnapshot,
  ScreenView,
  StandingsPayload,
  YouFinal,
  YouResult,
} from '@sq/shared';

export type GameStandings = StandingsPayload & { myRank: number | null };

/** Client-side game state shared by the participant (/play) and presenter (/screen) views. */
export interface GameState {
  v: number;
  /** server time of the last phase change (animation anchor) */
  at: number;
  room: (RoomPublicInfo & { joinUrl?: string }) | null;
  me: PlaySnapshot['me'] | null;
  roster: RosterEntry[];
  rosterCount: number;
  current: (CurrentQuestionState & { myAnswer?: { choiceId: number; receivedAt: number } | null }) | null;
  reveal: RevealPayload | null;
  you: YouResult | null;
  leaderboard: LeaderboardPayload | null;
  /** phone-only mini ranking; survives question start so the corner widget never blanks */
  standings: GameStandings | null;
  final: FinalResultsPayload | null;
  prizes: PrizeRevealPayload[];
  ended: GameEndedPayload | null;
  youFinal: YouFinal | null;
  view: ScreenView;
  /** set when an event arrives out of order and a full resync is needed */
  needsResync: boolean;
}

export const initialGame: GameState = {
  v: 0,
  at: 0,
  room: null,
  me: null,
  roster: [],
  rosterCount: 0,
  current: null,
  reveal: null,
  you: null,
  leaderboard: null,
  standings: null,
  final: null,
  prizes: [],
  ended: null,
  youFinal: null,
  view: 'AUTO',
  needsResync: false,
};

export type GameEvent =
  | { type: 'state:sync'; payload: PlaySnapshot | ScreenSnapshot }
  | { type: 'roster:delta'; payload: RosterDelta }
  | { type: 'question:start'; payload: QuestionStartPayload }
  | { type: 'question:progress'; payload: ProgressPayload }
  | { type: 'question:reveal'; payload: RevealPayload }
  | { type: 'you:result'; payload: YouResult }
  | { type: 'leaderboard:show'; payload: LeaderboardPayload }
  | { type: 'standings:update'; payload: StandingsPayload }
  | { type: 'game:final'; payload: FinalResultsPayload }
  | { type: 'prize:reveal'; payload: PrizeRevealPayload }
  | { type: 'game:ended'; payload: GameEndedPayload }
  | { type: 'you:final'; payload: YouFinal }
  | { type: 'screen:view'; payload: { view: ScreenView } }
  | { type: 'answer:local'; payload: { choiceId: number; receivedAt: number } };

const ROSTER_MAX = 400;

/** Version gate: ignore stale events, flag gaps so the caller can resync. */
function gate(s: GameState, v: number): 'ok' | 'stale' | 'gap' {
  if (v <= s.v) return 'stale';
  if (v > s.v + 1) return 'gap';
  return 'ok';
}

function withPhase(s: GameState, phase: RoomPublicInfo['phase'], index?: number): GameState['room'] {
  if (!s.room) return s.room;
  return { ...s.room, phase, currentIndex: index ?? s.room.currentIndex };
}

export function gameReducer(s: GameState, e: GameEvent): GameState {
  switch (e.type) {
    case 'state:sync': {
      const p = e.payload;
      const isPlay = 'me' in p;
      return {
        ...initialGame,
        v: p.v,
        at: p.at,
        room: p.room,
        me: isPlay ? (p as PlaySnapshot).me : null,
        roster: p.roster,
        rosterCount: p.rosterCount,
        current: p.current,
        reveal: p.reveal,
        you: isPlay ? (p as PlaySnapshot).you : null,
        leaderboard: p.leaderboard,
        standings: isPlay ? ((p as PlaySnapshot).standings ?? null) : null,
        final: p.final,
        prizes: p.prizes,
        ended: p.ended,
        youFinal: isPlay ? (p as PlaySnapshot).youFinal : null,
        view: 'view' in p ? (p as ScreenSnapshot).view : 'AUTO',
      };
    }
    case 'roster:delta': {
      const removed = new Set(e.payload.removed);
      const known = new Set(s.roster.map((r) => r.id));
      const roster = [...s.roster.filter((r) => !removed.has(r.id)), ...e.payload.added.filter((a) => !known.has(a.id))];
      return { ...s, roster: roster.slice(-ROSTER_MAX), rosterCount: e.payload.count };
    }
    case 'question:start': {
      const g = gate(s, e.payload.v);
      if (g === 'stale') return s;
      return {
        ...s,
        v: e.payload.v,
        at: e.payload.at,
        needsResync: g === 'gap',
        room: withPhase(s, 'QUESTION_ACTIVE', e.payload.question.index),
        current: {
          question: e.payload.question,
          timing: e.payload.timing,
          answeredCount: 0,
          activeCount: e.payload.activeCount,
          myAnswer: null,
        },
        reveal: null,
        you: null,
        leaderboard: null,
      };
    }
    case 'question:progress': {
      if (!s.current || s.current.question.roomQuestionId !== e.payload.roomQuestionId) return s;
      return { ...s, current: { ...s.current, answeredCount: e.payload.answeredCount, activeCount: e.payload.activeCount } };
    }
    case 'answer:local': {
      if (!s.current) return s;
      return { ...s, current: { ...s.current, myAnswer: e.payload } };
    }
    case 'question:reveal': {
      const g = gate(s, e.payload.v);
      if (g === 'stale') return s;
      return {
        ...s,
        v: e.payload.v,
        at: e.payload.at,
        needsResync: g === 'gap' || !s.current || s.current.question.roomQuestionId !== e.payload.roomQuestionId,
        room: withPhase(s, 'QUESTION_REVEAL'),
        reveal: e.payload,
        current: s.current
          ? { ...s.current, answeredCount: e.payload.answeredCount, activeCount: e.payload.activeCount }
          : s.current,
      };
    }
    case 'you:result': {
      return {
        ...s,
        you: e.payload,
        me: s.me ? { ...s.me, score: e.payload.totalScore, streak: e.payload.streak } : s.me,
        standings: s.standings ? { ...s.standings, myRank: e.payload.rank } : s.standings,
      };
    }
    case 'standings:update': {
      // Not version-gated: it is derived data and always follows the reveal that produced it.
      if (s.standings && e.payload.at < s.standings.at) return s;
      // `you:result` (my rank) may land before or after this event, so take it from either place.
      return { ...s, standings: { ...e.payload, myRank: s.you?.rank ?? s.standings?.myRank ?? null } };
    }
    case 'leaderboard:show': {
      const g = gate(s, e.payload.v);
      if (g === 'stale') return s;
      return { ...s, v: e.payload.v, at: e.payload.at, needsResync: g === 'gap', room: withPhase(s, 'LEADERBOARD'), leaderboard: e.payload };
    }
    case 'game:final': {
      const g = gate(s, e.payload.v);
      if (g === 'stale') return s;
      return { ...s, v: e.payload.v, at: e.payload.at, needsResync: g === 'gap', room: withPhase(s, 'FINAL_RESULTS'), final: e.payload, standings: null };
    }
    case 'prize:reveal': {
      const g = gate(s, e.payload.v);
      if (g === 'stale') return s;
      const prizes = [...s.prizes.filter((p) => p.rank !== e.payload.rank), e.payload];
      return { ...s, v: e.payload.v, at: e.payload.at, needsResync: g === 'gap', room: withPhase(s, 'PRIZE_REVEAL'), prizes };
    }
    case 'game:ended': {
      const g = gate(s, e.payload.v);
      if (g === 'stale') return s;
      return { ...s, v: e.payload.v, at: e.payload.at, needsResync: g === 'gap', room: withPhase(s, 'ENDED'), ended: e.payload };
    }
    case 'you:final':
      return { ...s, youFinal: e.payload };
    case 'screen:view':
      return { ...s, view: e.payload.view };
  }
}
