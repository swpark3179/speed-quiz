import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  FinalResultsPayload,
  LeaderboardPayload,
  PrizeRevealPayload,
  QuestionStartPayload,
  RevealPayload,
  YouResult,
} from '@sq/shared';
import { CEREMONY_TIMING } from '@sq/shared';
import { RoomEngine } from '../src/game/room-engine';
import { makeQuestion, makeRoom, setupWorld, type World } from './helpers';

function join(w: World, engine: RoomEngine, names: string[]) {
  return names.map((n) => {
    const r = engine.join(n);
    engine.connect(r.participantId);
    return r.participantId;
  });
}

function openQuestion(w: World, engine: RoomEngine, index: number) {
  engine.startQuestion(index);
  const start = w.bus.last('question:start', 'play')!.payload as QuestionStartPayload;
  w.scheduler.advance(start.timing.opensAt - w.clock.t);
  return start;
}

function correctChoice(engine: RoomEngine, index: number) {
  const q = engine.adminSnapshot().questions[index]!;
  return { correct: q.choices.find((c) => c.isCorrect)!.id, wrong: q.choices.find((c) => !c.isCorrect)!.id, rqId: q.roomQuestionId };
}

describe('RoomEngine', () => {
  it('runs a full game: scoring by correct order, reveal, leaderboard, final, ceremony', () => {
    const w = setupWorld();
    const q1 = makeQuestion(w, {}, 1);
    const q2 = makeQuestion(w, {}, 0);
    const { engine } = makeRoom(w, [q1.id, q2.id], { prizeCount: 2 });
    const [a, b, c] = join(w, engine, ['가', '나', '다']);

    // Q1: answers before opensAt are refused
    engine.startQuestion(0);
    const c1 = correctChoice(engine, 0);
    expect(() => engine.submitAnswer(a!, c1.rqId, c1.correct)).toThrow(/아직/);
    w.scheduler.advance(3000);
    w.clock.t += 1000;
    engine.submitAnswer(c!, c1.rqId, c1.correct); // 1st correct
    w.clock.t += 500;
    engine.submitAnswer(a!, c1.rqId, c1.correct); // 2nd correct
    expect(() => engine.submitAnswer(a!, c1.rqId, c1.wrong)).toThrow(/이미/);
    engine.submitAnswer(b!, c1.rqId, c1.wrong); // last one → auto close

    expect(engine.phase).toBe('QUESTION_REVEAL');
    const reveal = w.bus.last('question:reveal', 'play')!.payload as RevealPayload;
    expect(reveal.closeReason).toBe('ALL_ANSWERED');
    expect(reveal.correctChoiceIds).toEqual([c1.correct]);
    expect(reveal.correctCount).toBe(2);
    const results = w.bus.of('you:result', 'player');
    const byPid = new Map(results.map((r) => [r.id, r.payload as YouResult]));
    expect(byPid.get(c!)).toMatchObject({ correct: true, points: 1000, correctRank: 1, rank: 1 });
    expect(byPid.get(a!)).toMatchObject({ correct: true, points: 950, correctRank: 2, rank: 2 });
    expect(byPid.get(b!)).toMatchObject({ correct: false, points: 0, rank: 3 });

    engine.showLeaderboard(0);
    const lb = w.bus.last('leaderboard:show', 'screen')!.payload as LeaderboardPayload;
    expect(lb.top.map((e) => [e.nickname, e.score, e.delta])).toEqual([
      ['다', 1000, 1000],
      ['가', 950, 950],
      ['나', 0, 0],
    ]);

    // Q2: only b answers correctly; then timer closes it
    const s2 = openQuestion(w, engine, 1);
    const c2 = correctChoice(engine, 1);
    engine.submitAnswer(b!, c2.rqId, c2.correct);
    w.scheduler.advance(s2.timing.endsAt - w.clock.t + 400);
    expect(engine.phase).toBe('QUESTION_REVEAL');
    expect((w.bus.last('question:reveal', 'screen')!.payload as RevealPayload).closeReason).toBe('TIMER');

    engine.showLeaderboard(1);
    const lb2 = w.bus.last('leaderboard:show', 'screen')!.payload as LeaderboardPayload;
    // 나: 1000 total, ties 다 on score/correct count but answered faster → overtakes to 1st
    expect(lb2.top.find((e) => e.nickname === '나')).toMatchObject({ prevRank: 3, rank: 1, delta: 1000 });

    engine.finish();
    expect(engine.phase).toBe('FINAL_RESULTS');
    const finalScreen = w.bus.last('game:final', 'screen')!.payload as FinalResultsPayload;
    expect(finalScreen.winnerCount).toBe(2);
    expect(finalScreen.ranksBeyondPrize.map((e) => [e.rank, e.nickname])).toEqual([[3, '가']]);
    const finalPlay = w.bus.last('game:final', 'play')!.payload as FinalResultsPayload;
    expect(finalPlay.ranksBeyondPrize).toEqual([]);

    expect(() => engine.revealPrize(1)).toThrow();
    engine.revealPrize(2);
    const p2 = w.bus.last('prize:reveal', 'play')!.payload as PrizeRevealPayload;
    expect(p2).toMatchObject({ rank: 2, first: true, kind: 'standard' });
    expect(p2.flipAt - p2.startAt).toBe(CEREMONY_TIMING.standard.flipAt);
    engine.revealPrize(1);
    expect((w.bus.last('prize:reveal', 'screen')!.payload as PrizeRevealPayload).kind).toBe('grand');
    expect(engine.adminSnapshot().primary?.type).toBe('END');
    engine.end();
    expect(engine.phase).toBe('ENDED');
    expect(w.bus.of('you:final', 'player')).toHaveLength(3);
    const winners = w.db.all<{ final_rank: number }>('SELECT final_rank FROM participants ORDER BY final_rank');
    expect(winners.map((x) => x.final_rank)).toEqual([1, 2, 3]);
  });

  it('never sends correct answers to players or screens before reveal', () => {
    const w = setupWorld();
    const q = makeQuestion(w, { kind: 'HTML', body: '<p>문제</p>' }, 2);
    const { engine } = makeRoom(w, [q.id], { prizeCount: 1 });
    const [a] = join(w, engine, ['가']);
    join(w, engine, ['나']);
    openQuestion(w, engine, 0);
    const c = correctChoice(engine, 0);
    engine.submitAnswer(a!, c.rqId, c.correct);
    w.scheduler.advance(300);
    engine.playSnapshot(a!);
    engine.screenSnapshot();
    const before = w.bus.events.filter((e) => e.ns !== 'admin');
    const serialized = JSON.stringify([...before.map((e) => e.payload), engine.playSnapshot(a!), engine.screenSnapshot()]);
    expect(serialized).not.toMatch(/isCorrect|correctChoiceIds|"correct"/);
    engine.closeQuestion(c.rqId, 'MANUAL');
    expect(JSON.stringify(w.bus.last('question:reveal', 'play')!.payload)).toMatch(/correctChoiceIds/);
  });

  it('guards stale / invalid control commands', () => {
    const w = setupWorld();
    const q = makeQuestion(w);
    const { engine } = makeRoom(w, [q.id, q.id]);
    expect(() => engine.startQuestion(1)).toThrow();
    engine.startQuestion(0);
    expect(() => engine.startQuestion(0)).toThrow();
    const rq = engine.adminSnapshot().questions[0]!.roomQuestionId;
    engine.closeQuestion(rq, 'MANUAL');
    expect(() => engine.closeQuestion(rq, 'MANUAL')).toThrow();
    expect(() => engine.finish()).toThrow();
    engine.startQuestion(1);
    expect(engine.currentIndex).toBe(1);
  });

  it('rejects late answers after the grace period and duplicate nicknames', () => {
    const w = setupWorld();
    const q = makeQuestion(w, { timeLimitSec: 5 });
    const { engine } = makeRoom(w, [q.id], { autoCloseWhenAllAnswered: false });
    const [a] = join(w, engine, ['홍길동']);
    expect(() => engine.join(' 홍길동 ')).toThrow(/닉네임/);
    expect(() => engine.join('')).toThrow();
    engine.startQuestion(0);
    const c = correctChoice(engine, 0);
    w.clock.t += 3000 + 5000 + 301;
    expect(() => engine.submitAnswer(a!, c.rqId, c.correct)).toThrow(/마감/);
  });

  it('auto-close ignores disconnected players, kick frees the nickname', () => {
    const w = setupWorld();
    const q = makeQuestion(w);
    const { engine } = makeRoom(w, [q.id]);
    const [a, b] = join(w, engine, ['A', 'B']);
    openQuestion(w, engine, 0);
    const c = correctChoice(engine, 0);
    engine.submitAnswer(a!, c.rqId, c.correct);
    expect(engine.phase).toBe('QUESTION_ACTIVE');
    engine.disconnect(b!);
    // a dropped phone gets a short grace period to reconnect before it can trigger auto-close
    expect(engine.phase).toBe('QUESTION_ACTIVE');
    w.scheduler.advance(3100);
    expect(engine.phase).toBe('QUESTION_REVEAL');
    engine.kick(b!);
    expect(w.bus.disconnected).toContain(b);
    expect(engine.join('B').participantId).toBeGreaterThan(b!); // kicked nickname is free again (late join allowed)
  });

  it('recovers an active question after a restart', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-test-'));
    const file = path.join(dir, 'db.sqlite');
    const w = setupWorld(file);
    const q = makeQuestion(w, { timeLimitSec: 10 });
    const { engine, room } = makeRoom(w, [q.id, q.id]);
    const [a, b] = join(w, engine, ['A', 'B']);
    openQuestion(w, engine, 0);
    const c = correctChoice(engine, 0);
    engine.submitAnswer(a!, c.rqId, c.correct);

    // Simulate a crash: new engine from the same DB, 2s later.
    engine.dispose();
    w.clock.t += 2000;
    const restored = RoomEngine.load(
      { db: w.db, clock: w.clock, scheduler: w.scheduler, bus: w.bus, graceMs: 300 },
      room.id,
    );
    restored.resume();
    expect(restored.phase).toBe('QUESTION_ACTIVE');
    expect(restored.myAnswer(a!)).toMatchObject({ choiceId: c.correct });
    expect(() => restored.submitAnswer(a!, c.rqId, c.wrong)).toThrow(/이미/);
    restored.connect(b!);
    w.scheduler.advance(20_000);
    expect(restored.phase).toBe('QUESTION_REVEAL');
    expect(restored.playSnapshot(a!).you).toMatchObject({ correct: true, points: 1000 });

    // Expired while down: resume() closes immediately.
    restored.startQuestion(1);
    restored.dispose();
    w.clock.t += 60_000;
    const again = RoomEngine.load({ db: w.db, clock: w.clock, scheduler: w.scheduler, bus: w.bus, graceMs: 300 }, room.id);
    again.resume();
    expect(again.phase).toBe('QUESTION_REVEAL');
    expect(again.playSnapshot(a!).me.score).toBe(1000);
    w.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a reconnect within the grace period prevents a premature auto-close', () => {
    const w = setupWorld();
    const q = makeQuestion(w);
    const { engine } = makeRoom(w, [q.id]);
    const [a, b] = join(w, engine, ['A', 'B']);
    openQuestion(w, engine, 0);
    const c = correctChoice(engine, 0);
    engine.submitAnswer(a!, c.rqId, c.correct);
    engine.disconnect(b!); // e.g. page reload
    w.scheduler.advance(1000);
    engine.connect(b!);
    w.scheduler.advance(3000);
    expect(engine.phase).toBe('QUESTION_ACTIVE');
    engine.submitAnswer(b!, c.rqId, c.wrong);
    expect(engine.phase).toBe('QUESTION_REVEAL');
  });

  it('reset wipes participants and returns to lobby', () => {
    const w = setupWorld();
    const q = makeQuestion(w);
    const { engine } = makeRoom(w, [q.id]);
    join(w, engine, ['A', 'B']);
    openQuestion(w, engine, 0);
    engine.reset();
    expect(engine.phase).toBe('LOBBY');
    expect(engine.screenSnapshot().rosterCount).toBe(0);
    expect(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM participants')!.n).toBe(0);
    expect(w.bus.last('room:reset', 'play')).toBeTruthy();
  });

  it('hides question bodies on phones when showQuestionOnDevices is off', () => {
    const w = setupWorld();
    const q = makeQuestion(w, { body: '비밀 본문' });
    const { engine } = makeRoom(w, [q.id], { showQuestionOnDevices: false });
    join(w, engine, ['A']);
    engine.startQuestion(0);
    expect((w.bus.last('question:start', 'play')!.payload as QuestionStartPayload).question.body).toBe('');
    expect((w.bus.last('question:start', 'screen')!.payload as QuestionStartPayload).question.body).toBe('비밀 본문');
  });
});
