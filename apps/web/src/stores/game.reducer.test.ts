import { describe, expect, it } from 'vitest';
import type { PlaySnapshot, QuestionStartPayload, RevealPayload, StandingsPayload, YouResult } from '@sq/shared';
import { gameReducer, initialGame } from './game.reducer';
import { ServerClock } from '../lib/clock';

const snap: PlaySnapshot = {
  v: 3,
  at: 1000,
  room: {
    id: 1,
    title: 't',
    code: '123456',
    phase: 'LOBBY',
    total: 2,
    currentIndex: -1,
    prizeCount: 3,
    showQuestionOnDevices: true,
    showLeaderboardAfterEach: true,
    leaderboardSize: 10,
  },
  me: { id: 7, nickname: '나', score: 0, correctCount: 0, streak: 0 },
  roster: [{ id: 7, nickname: '나' }],
  rosterCount: 1,
  current: null,
  reveal: null,
  you: null,
  leaderboard: null,
  standings: null,
  final: null,
  prizes: [],
  ended: null,
  youFinal: null,
};

const start: QuestionStartPayload = {
  v: 4,
  at: 2000,
  activeCount: 1,
  timing: { startedAt: 2000, opensAt: 5000, endsAt: 25000 },
  question: { roomQuestionId: 11, index: 0, total: 2, kind: 'TEXT', body: 'Q', imageUrl: null, timeLimitMs: 20000, choices: [] },
};

describe('gameReducer', () => {
  it('applies snapshot, start, reveal and ignores stale events', () => {
    let s = gameReducer(initialGame, { type: 'state:sync', payload: snap });
    expect(s.me?.nickname).toBe('나');
    s = gameReducer(s, { type: 'roster:delta', payload: { added: [{ id: 8, nickname: '너' }], removed: [], count: 2 } });
    expect(s.roster).toHaveLength(2);
    s = gameReducer(s, { type: 'question:start', payload: start });
    expect(s.room?.phase).toBe('QUESTION_ACTIVE');
    expect(s.current?.myAnswer).toBeNull();
    const stale = gameReducer(s, { type: 'question:start', payload: { ...start, v: 2 } });
    expect(stale).toBe(s);
    const reveal = { v: 5, at: 3000, roomQuestionId: 11 } as RevealPayload;
    s = gameReducer(s, { type: 'question:reveal', payload: { ...reveal, answeredCount: 1, activeCount: 1 } });
    expect(s.room?.phase).toBe('QUESTION_REVEAL');
    expect(s.needsResync).toBe(false);
  });

  it('flags version gaps for resync', () => {
    let s = gameReducer(initialGame, { type: 'state:sync', payload: snap });
    s = gameReducer(s, { type: 'question:start', payload: { ...start, v: 9 } });
    expect(s.needsResync).toBe(true);
  });
});

describe('standings', () => {
  const st: StandingsPayload = {
    v: 5,
    at: 3000,
    total: 3,
    top: [
      { participantId: 8, nickname: '너', score: 900, rank: 1 },
      { participantId: 7, nickname: '나', score: 500, rank: 2 },
    ],
  };

  it('picks up my rank when you:result arrives before the standings (server order)', () => {
    let s = gameReducer(initialGame, { type: 'state:sync', payload: snap });
    s = gameReducer(s, { type: 'you:result', payload: { totalScore: 500, streak: 1, rank: 2, total: 3 } as YouResult });
    s = gameReducer(s, { type: 'standings:update', payload: st });
    expect(s.standings?.myRank).toBe(2);
  });

  it('keeps standings across the next question start, tracks my rank, drops them for the ceremony', () => {
    let s = gameReducer(initialGame, { type: 'state:sync', payload: snap });
    expect(s.standings).toBeNull();
    s = gameReducer(s, { type: 'standings:update', payload: st });
    s = gameReducer(s, { type: 'you:result', payload: { totalScore: 500, streak: 1, rank: 2, total: 3 } as YouResult });
    expect(s.standings?.myRank).toBe(2);
    // a newer update keeps my rank until the next you:result arrives
    s = gameReducer(s, { type: 'standings:update', payload: { ...st, at: 4000 } });
    expect(s.standings?.myRank).toBe(2);
    // next question must not blank the corner widget
    s = gameReducer(s, { type: 'question:start', payload: { ...start, v: 4 } });
    expect(s.standings?.top).toHaveLength(2);
    // an out-of-order (older) update is ignored
    const kept = s;
    expect(gameReducer(s, { type: 'standings:update', payload: { ...st, at: 1 } })).toBe(kept);
    s = gameReducer(s, { type: 'game:final', payload: { v: 5, at: 5000, winnerCount: 1, totalParticipants: 3, ranksBeyondPrize: [], stats: { questions: 1, avgCorrectRate: 0 } } });
    expect(s.standings).toBeNull();
  });
});

describe('ServerClock.estimate', () => {
  it('uses the lowest-RTT sample', () => {
    const r = ServerClock.estimate([
      { t0: 0, t1: 100, server: 1000 },
      { t0: 200, t1: 220, server: 1300 },
    ]);
    expect(r).toEqual({ offset: 1300 - 210, rtt: 20 });
  });
});
