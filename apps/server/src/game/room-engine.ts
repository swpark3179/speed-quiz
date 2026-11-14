import {
  AppError,
  CEREMONY_LEAD_MS,
  CEREMONY_OPENING_MS,
  CEREMONY_TIMING,
  RoomSettings,
  availableActions,
  ceremonyKind,
  nextPrizeRank,
  STANDINGS_SIZE,
  nicknameKey,
  primaryAction,
  rankRows,
  scorePoints,
  validateNickname,
  type AdminLive,
  type AdminParticipant,
  type AdminQuestionBrief,
  type AdminSnapshot,
  type CloseReason,
  type ControlCommand,
  type FinalResultsPayload,
  type GameEndedPayload,
  type LeaderboardEntry,
  type LeaderboardPayload,
  type Phase,
  type PhaseContext,
  type PlaySnapshot,
  type PrizeRevealPayload,
  type ProgressPayload,
  type QuestionKind,
  type QuestionStartPayload,
  type RevealPayload,
  type RoomPublicInfo,
  type RosterEntry,
  type ScreenSnapshot,
  type StandingsPayload,
  type ScreenView,
  type YouFinal,
  type YouResult,
} from '@sq/shared';
import type { Db } from '../db/driver';
import { newToken, sha256 } from '../auth/tokens';
import { previewText, publicQuestion, type RQ } from './projections';
import type { Bus, Clock, Scheduler } from './runtime';

export interface EngineDeps {
  db: Db;
  clock: Clock;
  scheduler: Scheduler;
  bus: Bus;
  graceMs: number;
  onEnded?: (roomId: number) => void;
}

interface PState {
  id: number;
  nickname: string;
  key: string;
  joinedAt: number;
  kicked: boolean;
  sockets: number;
  score: number;
  correctCount: number;
  correctTimeMs: number;
  streak: number;
  bestStreak: number;
}

interface AnswerRec {
  pid: number;
  choiceId: number;
  seq: number;
  receivedAt: number;
  elapsedMs: number;
  correct: boolean;
  correctRank: number | null;
  points: number;
}

interface Agg {
  score: number;
  correctCount: number;
  correctTimeMs: number;
  streak: number;
  bestStreak: number;
  delta: number;
}

interface Ranked {
  pid: number;
  rank: number;
  score: number;
  correctCount: number;
  correctTimeMs: number;
}

interface RoomRow {
  id: number;
  title: string;
  phase: Phase;
  code: string | null;
  presenter_key: string | null;
  settings: string;
  current_index: number;
  prizes_revealed: number;
  state_version: number;
  screen_view: ScreenView;
  base_url: string | null;
  started_at: number | null;
}

const ROSTER_FLUSH_MS = 500;
const PROGRESS_FLUSH_MS = 250;
const ROSTER_SNAPSHOT_MAX = 300;
/** A dropped connection (reload, Wi-Fi blip) gets this long to come back before it can trigger auto-close. */
const DISCONNECT_AUTOCLOSE_GRACE_MS = 3000;

export class RoomEngine {
  readonly id: number;
  title: string;
  code: string;
  presenterKey: string;
  baseUrl: string;
  settings: RoomSettings;
  phase: Phase;
  currentIndex: number;
  prizesRevealed: number;
  v: number;
  screenView: ScreenView;
  startedAt: number | null;

  readonly questions: RQ[];
  private readonly participants = new Map<number, PState>();
  private readonly answers = new Map<number, Map<number, AnswerRec>>();
  private readonly seq = new Map<number, number>();
  private readonly correctCounter = new Map<number, number>();

  private timer: unknown = null;
  private rosterTimer: unknown = null;
  private progressTimer: unknown = null;
  private autoCloseTimer: unknown = null;
  private rosterAdded: RosterEntry[] = [];
  private rosterRemoved: number[] = [];
  private rosterDirty = false;

  private lastReveal: RevealPayload | null = null;
  private lastResults = new Map<number, YouResult>();
  private lastLeaderboard: LeaderboardPayload | null = null;
  private finalRanking: Ranked[] | null = null;
  private finalPayload: FinalResultsPayload | null = null;
  private winners: { rank: number; participantId: number; nickname: string; score: number }[] = [];
  private prizes: PrizeRevealPayload[] = [];
  private ended: GameEndedPayload | null = null;
  private disposed = false;

  private constructor(
    private readonly deps: EngineDeps,
    row: RoomRow,
    questions: RQ[],
  ) {
    this.id = row.id;
    this.title = row.title;
    this.code = row.code ?? '';
    this.presenterKey = row.presenter_key ?? '';
    this.baseUrl = row.base_url ?? '';
    this.settings = RoomSettings.parse(JSON.parse(row.settings));
    this.phase = row.phase;
    this.currentIndex = row.current_index;
    this.prizesRevealed = row.prizes_revealed;
    this.v = row.state_version;
    this.screenView = row.screen_view === 'JOIN_QR' ? 'JOIN_QR' : 'AUTO';
    this.startedAt = row.started_at;
    this.questions = questions;
  }

  /* ------------------------------------------------------------------ */
  /* Loading / recovery                                                  */
  /* ------------------------------------------------------------------ */

  static load(deps: EngineDeps, roomId: number): RoomEngine {
    const { db } = deps;
    const row = db.get<RoomRow>('SELECT * FROM rooms WHERE id = ?', roomId);
    if (!row) throw new AppError('ROOM_NOT_FOUND');
    if (row.phase === 'DRAFT') throw new AppError('NOT_JOINABLE');

    const rqRows = db.all<{
      id: number;
      position: number;
      kind: QuestionKind;
      title: string;
      body: string;
      image_url: string | null;
      explanation: string | null;
      time_limit_ms: number;
      points_multiplier: number;
      started_at: number | null;
      opens_at: number | null;
      ends_at: number | null;
      closed_at: number | null;
      close_reason: CloseReason | null;
    }>('SELECT * FROM room_questions WHERE room_id = ? ORDER BY position', roomId);
    const choiceRows = db.all<{ id: number; room_question_id: number; position: number; text: string; is_correct: number }>(
      `SELECT c.* FROM room_question_choices c JOIN room_questions q ON q.id = c.room_question_id
       WHERE q.room_id = ? ORDER BY c.room_question_id, c.position`,
      roomId,
    );
    const byQ = new Map<number, RQ['choices']>();
    for (const c of choiceRows) {
      const list = byQ.get(c.room_question_id) ?? [];
      list.push({ id: c.id, position: c.position, text: c.text, isCorrect: !!c.is_correct });
      byQ.set(c.room_question_id, list);
    }
    const questions: RQ[] = rqRows.map((r) => {
      const choices = byQ.get(r.id) ?? [];
      return {
        id: r.id,
        position: r.position,
        kind: r.kind,
        title: r.title,
        body: r.body,
        imageUrl: r.image_url,
        explanation: r.explanation,
        timeLimitMs: r.time_limit_ms,
        multiplier: r.points_multiplier,
        choices,
        correctIds: new Set(choices.filter((c) => c.isCorrect).map((c) => c.id)),
        startedAt: r.started_at,
        opensAt: r.opens_at,
        endsAt: r.ends_at,
        closedAt: r.closed_at,
        closeReason: r.close_reason,
      };
    });

    const engine = new RoomEngine(deps, row, questions);

    const pRows = db.all<{ id: number; nickname: string; nickname_key: string; joined_at: number; kicked_at: number | null }>(
      'SELECT id, nickname, nickname_key, joined_at, kicked_at FROM participants WHERE room_id = ? ORDER BY id',
      roomId,
    );
    for (const p of pRows) {
      engine.participants.set(p.id, {
        id: p.id,
        nickname: p.nickname,
        key: p.nickname_key,
        joinedAt: p.joined_at,
        kicked: p.kicked_at !== null,
        sockets: 0,
        score: 0,
        correctCount: 0,
        correctTimeMs: 0,
        streak: 0,
        bestStreak: 0,
      });
    }
    for (const q of questions) {
      engine.answers.set(q.id, new Map());
      engine.seq.set(q.id, 0);
      engine.correctCounter.set(q.id, 0);
    }
    const aRows = db.all<{
      room_question_id: number;
      participant_id: number;
      choice_id: number;
      seq: number;
      received_at: number;
      elapsed_ms: number;
      is_correct: number;
      correct_rank: number | null;
      points: number;
    }>(
      `SELECT a.* FROM answers a JOIN room_questions q ON q.id = a.room_question_id WHERE q.room_id = ?`,
      roomId,
    );
    for (const a of aRows) {
      engine.answers.get(a.room_question_id)?.set(a.participant_id, {
        pid: a.participant_id,
        choiceId: a.choice_id,
        seq: a.seq,
        receivedAt: a.received_at,
        elapsedMs: a.elapsed_ms,
        correct: !!a.is_correct,
        correctRank: a.correct_rank,
        points: a.points,
      });
      engine.seq.set(a.room_question_id, Math.max(engine.seq.get(a.room_question_id) ?? 0, a.seq));
      if (a.is_correct) {
        engine.correctCounter.set(a.room_question_id, Math.max(engine.correctCounter.get(a.room_question_id) ?? 0, a.correct_rank ?? 0));
      }
    }

    engine.applyAggregates(engine.aggregate(engine.lastClosedIndex()));

    if (engine.phase === 'QUESTION_REVEAL' || engine.phase === 'LEADERBOARD') {
      const q = engine.questions[engine.currentIndex];
      if (q?.closedAt) {
        engine.buildRevealState(engine.currentIndex, q.closedAt);
        if (engine.phase === 'LEADERBOARD') engine.lastLeaderboard = engine.buildLeaderboard(engine.currentIndex, q.closedAt);
      }
    }
    if (engine.phase === 'FINAL_RESULTS' || engine.phase === 'PRIZE_REVEAL' || engine.phase === 'ENDED') {
      engine.computeFinal(deps.clock.now(), false);
      const winnerCount = engine.winners.length;
      for (let i = 0; i < Math.min(engine.prizesRevealed, winnerCount); i++) {
        const w = engine.winners[winnerCount - 1 - i]!;
        engine.prizes.push(engine.prizePayload(w.rank, 0, 0, i + 1, i === 0));
      }
      if (engine.phase === 'ENDED') engine.ended = engine.buildEnded(deps.clock.now());
    }
    return engine;
  }

  /** Called once the engine is registered: re-arms or fires the question timer after a restart. */
  resume(): void {
    if (this.phase !== 'QUESTION_ACTIVE') return;
    const q = this.questions[this.currentIndex];
    if (!q || q.endsAt === null) return;
    const remaining = q.endsAt + this.deps.graceMs - this.deps.clock.now();
    if (remaining <= 0) this.closeQuestion(q.id, 'TIMER');
    else this.armTimer(q.id, remaining);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [this.timer, this.rosterTimer, this.progressTimer, this.autoCloseTimer]) if (t) this.deps.scheduler.clear(t);
    this.timer = this.rosterTimer = this.progressTimer = this.autoCloseTimer = null;
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  get total(): number {
    return this.questions.length;
  }

  private now(): number {
    return this.deps.clock.now();
  }

  private current(): RQ | null {
    return this.questions[this.currentIndex] ?? null;
  }

  private lastClosedIndex(): number {
    let idx = -1;
    for (const q of this.questions) if (q.closedAt !== null) idx = Math.max(idx, q.position);
    return idx;
  }

  private activeParticipants(): PState[] {
    return [...this.participants.values()].filter((p) => !p.kicked);
  }

  /** Aggregates over closed questions 0..upto (inclusive). Kicked participants excluded. */
  private aggregate(upto: number): Map<number, Agg> {
    const agg = new Map<number, Agg>();
    for (const p of this.participants.values()) {
      if (p.kicked) continue;
      agg.set(p.id, { score: 0, correctCount: 0, correctTimeMs: 0, streak: 0, bestStreak: 0, delta: 0 });
    }
    for (let i = 0; i <= upto && i < this.questions.length; i++) {
      const q = this.questions[i]!;
      if (q.closedAt === null) continue;
      const ans = this.answers.get(q.id);
      for (const [pid, a] of agg) {
        const rec = ans?.get(pid);
        const pts = rec?.correct ? rec.points : 0;
        if (rec?.correct) {
          a.score += pts;
          a.correctCount += 1;
          a.correctTimeMs += rec.elapsedMs;
          a.streak += 1;
          a.bestStreak = Math.max(a.bestStreak, a.streak);
        } else {
          a.streak = 0;
        }
        a.delta = i === upto ? pts : 0;
      }
    }
    return agg;
  }

  private applyAggregates(agg: Map<number, Agg>): void {
    for (const [pid, a] of agg) {
      const p = this.participants.get(pid);
      if (!p) continue;
      p.score = a.score;
      p.correctCount = a.correctCount;
      p.correctTimeMs = a.correctTimeMs;
      p.streak = a.streak;
      p.bestStreak = a.bestStreak;
    }
  }

  private rank(agg: Map<number, Agg>): Ranked[] {
    const rows = [...agg.entries()].map(([pid, a]) => ({
      id: pid,
      pid,
      score: a.score,
      correctCount: a.correctCount,
      correctTimeMs: a.correctTimeMs,
      joinedAt: this.participants.get(pid)?.joinedAt ?? 0,
    }));
    return rankRows(rows).map((r) => ({
      pid: r.pid,
      rank: r.rank,
      score: r.score,
      correctCount: r.correctCount,
      correctTimeMs: r.correctTimeMs,
    }));
  }

  private currentRanking(): Ranked[] {
    return this.rank(this.aggregate(this.lastClosedIndex()));
  }

  private phaseContext(): PhaseContext {
    return {
      phase: this.phase,
      currentIndex: this.currentIndex,
      total: this.total,
      winnerCount: this.winners.length,
      prizesRevealed: this.prizesRevealed,
      showLeaderboardAfterEach: this.settings.showLeaderboardAfterEach,
    };
  }

  private persistRoom(extra: { startedAt?: number; finishedAt?: number } = {}): void {
    const now = this.now();
    this.deps.db.run(
      `UPDATE rooms SET phase = ?, current_index = ?, prizes_revealed = ?, state_version = ?, screen_view = ?, updated_at = ?,
         started_at = COALESCE(started_at, ?), finished_at = COALESCE(?, finished_at) WHERE id = ?`,
      this.phase,
      this.currentIndex,
      this.prizesRevealed,
      this.v,
      this.screenView,
      now,
      extra.startedAt ?? null,
      extra.finishedAt ?? null,
      this.id,
    );
  }

  private ensurePhase(...phases: Phase[]): void {
    if (!phases.includes(this.phase)) throw new AppError('INVALID_TRANSITION');
  }

  private armTimer(rqId: number, ms: number): void {
    if (this.timer) this.deps.scheduler.clear(this.timer);
    const v = this.v;
    this.timer = this.deps.scheduler.set(() => {
      this.timer = null;
      if (this.disposed || this.v !== v || this.phase !== 'QUESTION_ACTIVE') return;
      try {
        this.closeQuestion(rqId, 'TIMER');
      } catch {
        /* stale timer */
      }
    }, ms);
  }

  roomInfo(): RoomPublicInfo {
    return {
      id: this.id,
      title: this.title,
      code: this.code,
      phase: this.phase,
      total: this.total,
      currentIndex: this.currentIndex,
      prizeCount: this.settings.prizeCount,
      showQuestionOnDevices: this.settings.showQuestionOnDevices,
      showLeaderboardAfterEach: this.settings.showLeaderboardAfterEach,
      leaderboardSize: this.settings.leaderboardSize,
    };
  }

  joinUrl(): string {
    return `${this.baseUrl}/join/${this.code}`;
  }

  presenterUrl(): string {
    return `${this.baseUrl}/screen/${this.id}#key=${this.presenterKey}`;
  }

  /* ------------------------------------------------------------------ */
  /* Participants                                                        */
  /* ------------------------------------------------------------------ */

  isJoinable(): boolean {
    if (this.phase === 'LOBBY') return true;
    if (!this.settings.allowLateJoin) return false;
    return this.phase === 'QUESTION_ACTIVE' || this.phase === 'QUESTION_REVEAL' || this.phase === 'LEADERBOARD';
  }

  join(rawNickname: string): { participantId: number; token: string } {
    if (!this.isJoinable()) throw new AppError('NOT_JOINABLE');
    const check = validateNickname(rawNickname);
    if (!check.ok) throw new AppError('NICKNAME_INVALID');
    const active = this.activeParticipants();
    if (active.length >= this.settings.maxParticipants) throw new AppError('ROOM_FULL');
    const key = nicknameKey(check.value);
    if (active.some((p) => p.key === key)) throw new AppError('NICKNAME_TAKEN');
    const token = newToken();
    const now = this.now();
    let id: number;
    try {
      id = this.deps.db.run(
        'INSERT INTO participants (room_id, nickname, nickname_key, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)',
        this.id,
        check.value,
        key,
        sha256(token),
        now,
      ).lastInsertRowid;
    } catch {
      throw new AppError('NICKNAME_TAKEN');
    }
    const p: PState = {
      id,
      nickname: check.value,
      key,
      joinedAt: now,
      kicked: false,
      sockets: 0,
      score: 0,
      correctCount: 0,
      correctTimeMs: 0,
      streak: 0,
      bestStreak: 0,
    };
    this.participants.set(id, p);
    this.rosterAdded.push({ id, nickname: p.nickname });
    this.scheduleRoster();
    return { participantId: id, token };
  }

  /** Lets a participant change their own nickname, but only while the game has not started. */
  rename(pid: number, rawNickname: string): { nickname: string } {
    const p = this.participants.get(pid);
    if (!p || p.kicked) throw new AppError('NOT_FOUND');
    if (this.phase !== 'LOBBY') {
      throw new AppError('INVALID_TRANSITION', '퀴즈가 시작된 뒤에는 닉네임을 바꿀 수 없어요.');
    }
    const check = validateNickname(rawNickname);
    if (!check.ok) throw new AppError('NICKNAME_INVALID');
    if (check.value === p.nickname) return { nickname: p.nickname };
    const key = nicknameKey(check.value);
    if (this.activeParticipants().some((o) => o.id !== pid && o.key === key)) throw new AppError('NICKNAME_TAKEN');
    try {
      this.deps.db.run('UPDATE participants SET nickname = ?, nickname_key = ? WHERE id = ?', check.value, key, pid);
    } catch {
      throw new AppError('NICKNAME_TAKEN');
    }
    p.nickname = check.value;
    p.key = key;
    // Listeners only understand add/remove: replace the entry so every roster view updates.
    this.rosterAdded = this.rosterAdded.filter((r) => r.id !== pid);
    this.rosterAdded.push({ id: pid, nickname: p.nickname });
    if (!this.rosterRemoved.includes(pid)) this.rosterRemoved.push(pid);
    this.scheduleRoster();
    return { nickname: p.nickname };
  }

  hasParticipant(pid: number): boolean {
    const p = this.participants.get(pid);
    return !!p && !p.kicked;
  }

  connect(pid: number): void {
    const p = this.participants.get(pid);
    if (!p) return;
    p.sockets += 1;
    if (p.sockets === 1) {
      this.deps.db.run('UPDATE participants SET last_seen_at = ? WHERE id = ?', this.now(), pid);
      this.rosterDirty = true;
      this.scheduleRoster();
      if (this.phase === 'QUESTION_ACTIVE') this.scheduleProgress();
    }
  }

  disconnect(pid: number): void {
    const p = this.participants.get(pid);
    if (!p) return;
    p.sockets = Math.max(0, p.sockets - 1);
    if (p.sockets === 0) {
      this.deps.db.run('UPDATE participants SET last_seen_at = ? WHERE id = ?', this.now(), pid);
      this.rosterDirty = true;
      this.scheduleRoster();
      if (this.phase === 'QUESTION_ACTIVE') {
        this.scheduleProgress();
        this.scheduleAutoCloseCheck();
      }
    }
  }

  private scheduleAutoCloseCheck(): void {
    if (this.autoCloseTimer || this.disposed) return;
    this.autoCloseTimer = this.deps.scheduler.set(() => {
      this.autoCloseTimer = null;
      this.maybeAutoClose();
    }, DISCONNECT_AUTOCLOSE_GRACE_MS);
  }

  kick(pid: number): void {
    const p = this.participants.get(pid);
    if (!p || p.kicked) throw new AppError('NOT_FOUND');
    p.kicked = true;
    this.deps.db.run('UPDATE participants SET kicked_at = ? WHERE id = ?', this.now(), pid);
    this.deps.bus.player(pid, 'session:kicked');
    this.deps.bus.disconnectPlayer(pid);
    this.rosterRemoved.push(pid);
    this.rosterAdded = this.rosterAdded.filter((r) => r.id !== pid);
    this.scheduleRoster();
    if (this.phase === 'QUESTION_ACTIVE') {
      this.scheduleProgress();
      this.maybeAutoClose();
    }
    this.pushAdminState();
  }

  rosterEntries(limit = ROSTER_SNAPSHOT_MAX): RosterEntry[] {
    const list = this.activeParticipants();
    return list.slice(Math.max(0, list.length - limit)).map((p) => ({ id: p.id, nickname: p.nickname }));
  }

  /* ------------------------------------------------------------------ */
  /* Throttled broadcasts                                                */
  /* ------------------------------------------------------------------ */

  private scheduleRoster(): void {
    if (this.rosterTimer || this.disposed) return;
    this.rosterTimer = this.deps.scheduler.set(() => {
      this.rosterTimer = null;
      this.flushRoster();
    }, ROSTER_FLUSH_MS);
  }

  flushRoster(): void {
    const count = this.activeParticipants().length;
    if (this.rosterAdded.length || this.rosterRemoved.length) {
      const delta = { added: this.rosterAdded, removed: this.rosterRemoved, count };
      this.deps.bus.play(this.id, 'roster:delta', delta);
      this.deps.bus.screen(this.id, 'roster:delta', delta);
      this.rosterAdded = [];
      this.rosterRemoved = [];
      this.rosterDirty = true;
    }
    if (this.rosterDirty) {
      this.rosterDirty = false;
      this.deps.bus.admin(this.id, 'admin:roster', { roomId: this.id, participants: this.adminParticipants() });
    }
  }

  private scheduleProgress(): void {
    if (this.progressTimer || this.disposed) return;
    this.progressTimer = this.deps.scheduler.set(() => {
      this.progressTimer = null;
      this.flushProgress();
    }, PROGRESS_FLUSH_MS);
  }

  flushProgress(): void {
    if (this.phase !== 'QUESTION_ACTIVE') return;
    const q = this.current();
    if (!q) return;
    const p: ProgressPayload = { roomQuestionId: q.id, ...this.counts(q) };
    this.deps.bus.play(this.id, 'question:progress', p);
    this.deps.bus.screen(this.id, 'question:progress', p);
    this.deps.bus.admin(this.id, 'admin:live', this.adminLive(q));
  }

  private counts(q: RQ): { answeredCount: number; activeCount: number } {
    const ans = this.answers.get(q.id) ?? new Map();
    let active = 0;
    for (const p of this.participants.values()) {
      if (p.kicked) continue;
      if (p.sockets > 0 || ans.has(p.id)) active++;
    }
    let answered = 0;
    for (const pid of ans.keys()) if (this.hasParticipant(pid)) answered++;
    return { answeredCount: answered, activeCount: Math.max(active, answered) };
  }

  /* ------------------------------------------------------------------ */
  /* Game flow                                                           */
  /* ------------------------------------------------------------------ */

  control(cmd: ControlCommand): void {
    switch (cmd.type) {
      case 'START_QUESTION':
        return this.startQuestion(cmd.index);
      case 'CLOSE_QUESTION':
        return this.closeQuestion(cmd.roomQuestionId, 'MANUAL');
      case 'SHOW_LEADERBOARD':
        return this.showLeaderboard(cmd.index);
      case 'FINISH':
        return this.finish();
      case 'REVEAL_PRIZE':
        return this.revealPrize(cmd.rank);
      case 'END':
        return this.end();
      case 'RESET':
        return this.reset();
      case 'ABORT':
        return this.abort();
      case 'KICK':
        return this.kick(cmd.participantId);
      case 'SCREEN_VIEW':
        return this.setScreenView(cmd.view);
    }
  }

  startQuestion(index: number): void {
    if (this.phase === 'LOBBY') {
      if (index !== 0) throw new AppError('STALE');
    } else if (this.phase === 'QUESTION_REVEAL' || this.phase === 'LEADERBOARD') {
      if (index !== this.currentIndex + 1) throw new AppError('STALE');
    } else {
      throw new AppError(this.phase === 'QUESTION_ACTIVE' ? 'STALE' : 'INVALID_TRANSITION');
    }
    const q = this.questions[index];
    if (!q) throw new AppError('INVALID_TRANSITION');
    const now = this.now();
    q.startedAt = now;
    q.opensAt = now + this.settings.readyCountdownSec * 1000;
    q.endsAt = q.opensAt + q.timeLimitMs;
    q.closedAt = null;
    q.closeReason = null;
    this.answers.set(q.id, new Map());
    this.seq.set(q.id, 0);
    this.correctCounter.set(q.id, 0);
    this.phase = 'QUESTION_ACTIVE';
    this.currentIndex = index;
    this.v += 1;
    this.lastReveal = null;
    this.lastLeaderboard = null;
    this.lastResults.clear();
    if (!this.startedAt) this.startedAt = now;
    this.deps.db.tx(() => {
      this.deps.db.run(
        'UPDATE room_questions SET started_at = ?, opens_at = ?, ends_at = ?, closed_at = NULL, close_reason = NULL WHERE id = ?',
        q.startedAt,
        q.opensAt,
        q.endsAt,
        q.id,
      );
      this.persistRoom({ startedAt: now });
    });
    const timing = { startedAt: q.startedAt, opensAt: q.opensAt, endsAt: q.endsAt };
    const { activeCount } = this.counts(q);
    const base = { v: this.v, at: now, timing, activeCount };
    this.deps.bus.play(this.id, 'question:start', {
      ...base,
      question: publicQuestion(q, this.total, this.settings.showQuestionOnDevices),
    } satisfies QuestionStartPayload);
    this.deps.bus.screen(this.id, 'question:start', {
      ...base,
      question: publicQuestion(q, this.total, true),
    } satisfies QuestionStartPayload);
    this.pushAdminState();
    this.armTimer(q.id, q.endsAt + this.deps.graceMs - now);
  }

  submitAnswer(pid: number, roomQuestionId: number, choiceId: number): { receivedAt: number; choiceId: number } {
    const now = this.now();
    const q = this.current();
    if (this.phase !== 'QUESTION_ACTIVE' || !q || q.id !== roomQuestionId) throw new AppError('NOT_ACTIVE');
    if (!this.hasParticipant(pid)) throw new AppError('KICKED');
    if (q.opensAt !== null && now < q.opensAt) throw new AppError('NOT_OPEN_YET');
    if (q.endsAt !== null && now > q.endsAt + this.deps.graceMs) throw new AppError('LATE');
    const ans = this.answers.get(q.id)!;
    const prev = ans.get(pid);
    if (prev) throw new AppError('ALREADY_ANSWERED');
    if (!q.choices.some((c) => c.id === choiceId)) throw new AppError('INVALID_CHOICE');

    const seq = (this.seq.get(q.id) ?? 0) + 1;
    this.seq.set(q.id, seq);
    const correct = q.correctIds.has(choiceId);
    let correctRank: number | null = null;
    if (correct) {
      correctRank = (this.correctCounter.get(q.id) ?? 0) + 1;
      this.correctCounter.set(q.id, correctRank);
    }
    const elapsedMs = Math.min(q.timeLimitMs, Math.max(0, now - (q.opensAt ?? now)));
    const points = correct
      ? scorePoints(this.settings.scoring, {
          correctRank: correctRank!,
          elapsedMs,
          timeLimitMs: q.timeLimitMs,
          multiplier: q.multiplier,
        })
      : 0;
    this.deps.db.run(
      `INSERT INTO answers (room_question_id, participant_id, choice_id, seq, received_at, elapsed_ms, is_correct, correct_rank, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      q.id,
      pid,
      choiceId,
      seq,
      now,
      elapsedMs,
      correct ? 1 : 0,
      correctRank,
      points,
    );
    ans.set(pid, { pid, choiceId, seq, receivedAt: now, elapsedMs, correct, correctRank, points });
    this.scheduleProgress();
    this.maybeAutoClose();
    return { receivedAt: now, choiceId };
  }

  /** The participant's existing answer for the active question (used to make submits idempotent). */
  myAnswer(pid: number): { choiceId: number; receivedAt: number } | null {
    const q = this.current();
    if (!q) return null;
    const a = this.answers.get(q.id)?.get(pid);
    return a ? { choiceId: a.choiceId, receivedAt: a.receivedAt } : null;
  }

  private maybeAutoClose(): void {
    if (!this.settings.autoCloseWhenAllAnswered || this.phase !== 'QUESTION_ACTIVE') return;
    const q = this.current();
    if (!q) return;
    const ans = this.answers.get(q.id)!;
    let connected = 0;
    for (const p of this.participants.values()) {
      if (p.kicked || p.sockets === 0) continue;
      connected++;
      if (!ans.has(p.id)) return;
    }
    if (connected === 0 || ans.size === 0) return;
    this.closeQuestion(q.id, 'ALL_ANSWERED');
  }

  closeQuestion(roomQuestionId: number, reason: CloseReason): void {
    const q = this.current();
    if (this.phase !== 'QUESTION_ACTIVE' || !q) throw new AppError(this.phase === 'QUESTION_REVEAL' ? 'STALE' : 'INVALID_TRANSITION');
    if (q.id !== roomQuestionId) throw new AppError('STALE');
    if (this.timer) {
      this.deps.scheduler.clear(this.timer);
      this.timer = null;
    }
    const now = this.now();
    q.closedAt = now;
    q.closeReason = reason;
    this.phase = 'QUESTION_REVEAL';
    this.v += 1;
    const agg = this.aggregate(this.currentIndex);
    this.applyAggregates(agg);
    this.deps.db.tx(() => {
      this.deps.db.run('UPDATE room_questions SET closed_at = ?, close_reason = ? WHERE id = ?', now, reason, q.id);
      for (const [pid, a] of agg) {
        this.deps.db.run(
          'UPDATE participants SET score = ?, correct_count = ?, correct_time_ms = ? WHERE id = ?',
          a.score,
          a.correctCount,
          a.correctTimeMs,
          pid,
        );
      }
      this.persistRoom();
    });
    this.buildRevealState(this.currentIndex, now);
    this.deps.bus.play(this.id, 'question:reveal', this.lastReveal);
    this.deps.bus.screen(this.id, 'question:reveal', this.lastReveal);
    for (const [pid, r] of this.lastResults) this.deps.bus.player(pid, 'you:result', r);
    const standings = this.buildStandings(now);
    if (standings) this.deps.bus.play(this.id, 'standings:update', standings);
    this.pushAdminState();
  }

  /**
   * Mini ranking shown in a corner of every phone. Built only from *closed* questions, so it never
   * reveals correctness before the reveal. Hidden when the host turned rankings off.
   */
  private buildStandings(at: number): StandingsPayload | null {
    if (!this.settings.showLeaderboardAfterEach || this.lastClosedIndex() < 0) return null;
    const ranking = this.currentRanking();
    return {
      v: this.v,
      at,
      total: ranking.length,
      top: ranking.slice(0, STANDINGS_SIZE).map((r) => ({
        participantId: r.pid,
        nickname: this.participants.get(r.pid)!.nickname,
        score: r.score,
        rank: r.rank,
      })),
    };
  }

  private buildRevealState(index: number, at: number): void {
    const q = this.questions[index]!;
    const ans = this.answers.get(q.id) ?? new Map<number, AnswerRec>();
    const valid = [...ans.values()].filter((a) => this.hasParticipant(a.pid));
    const distribution = q.choices.map((c) => ({ choiceId: c.id, count: valid.filter((a) => a.choiceId === c.id).length }));
    const fastest = valid
      .filter((a) => a.correct)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, 3)
      .map((a) => ({ nickname: this.participants.get(a.pid)!.nickname, elapsedMs: a.elapsedMs }));
    const counts = this.counts(q);
    this.lastReveal = {
      v: this.v,
      at,
      roomQuestionId: q.id,
      index,
      correctChoiceIds: [...q.correctIds],
      distribution,
      answeredCount: valid.length,
      activeCount: counts.activeCount,
      correctCount: valid.filter((a) => a.correct).length,
      closeReason: q.closeReason ?? 'MANUAL',
      explanation: q.explanation,
      fastest,
    };
    const before = new Map(this.rank(this.aggregate(index - 1)).map((r) => [r.pid, r.rank]));
    const aggAfter = this.aggregate(index);
    const after = this.rank(aggAfter);
    this.lastResults.clear();
    for (const r of after) {
      const a = ans.get(r.pid);
      const agg = aggAfter.get(r.pid)!;
      this.lastResults.set(r.pid, {
        roomQuestionId: q.id,
        answered: !!a,
        choiceId: a?.choiceId ?? null,
        correct: !!a?.correct,
        points: a?.correct ? a.points : 0,
        correctRank: a?.correctRank ?? null,
        elapsedMs: a?.elapsedMs ?? null,
        totalScore: agg.score,
        rank: r.rank,
        prevRank: before.get(r.pid) ?? null,
        total: after.length,
        streak: agg.streak,
      });
    }
  }

  private buildLeaderboard(index: number, at: number): LeaderboardPayload {
    const before = new Map(this.rank(this.aggregate(index - 1)).map((r) => [r.pid, r.rank]));
    const agg = this.aggregate(index);
    const after = this.rank(agg);
    const top: LeaderboardEntry[] = after.slice(0, this.settings.leaderboardSize).map((r) => ({
      participantId: r.pid,
      nickname: this.participants.get(r.pid)!.nickname,
      score: r.score,
      rank: r.rank,
      prevRank: before.get(r.pid) ?? null,
      delta: agg.get(r.pid)?.delta ?? 0,
      correctCount: r.correctCount,
    }));
    return { v: this.v, at, afterIndex: index, total: after.length, top };
  }

  showLeaderboard(index: number): void {
    if (this.phase === 'LEADERBOARD' && index === this.currentIndex) throw new AppError('STALE');
    this.ensurePhase('QUESTION_REVEAL');
    if (index !== this.currentIndex) throw new AppError('STALE');
    const now = this.now();
    this.phase = 'LEADERBOARD';
    this.v += 1;
    this.persistRoom();
    this.lastLeaderboard = this.buildLeaderboard(index, now);
    this.deps.bus.play(this.id, 'leaderboard:show', this.lastLeaderboard);
    this.deps.bus.screen(this.id, 'leaderboard:show', this.lastLeaderboard);
    this.pushAdminState();
  }

  private computeFinal(at: number, persist: boolean): void {
    const ranking = this.rank(this.aggregate(this.lastClosedIndex()));
    this.finalRanking = ranking;
    this.winners = ranking
      .filter((r) => r.score > 0)
      .slice(0, this.settings.prizeCount)
      .map((r) => ({ rank: r.rank, participantId: r.pid, nickname: this.participants.get(r.pid)!.nickname, score: r.score }));
    if (persist) {
      for (const r of ranking) this.deps.db.run('UPDATE participants SET final_rank = ? WHERE id = ?', r.rank, r.pid);
    }
    const closed = this.questions.filter((q) => q.closedAt !== null);
    let rateSum = 0;
    for (const q of closed) {
      const ans = [...(this.answers.get(q.id)?.values() ?? [])].filter((a) => this.hasParticipant(a.pid));
      const denom = Math.max(1, ranking.length);
      rateSum += ans.filter((a) => a.correct).length / denom;
    }
    const w = this.winners.length;
    this.finalPayload = {
      v: this.v,
      at,
      winnerCount: w,
      totalParticipants: ranking.length,
      ranksBeyondPrize: ranking.slice(w, w + 10).map((r) => this.entry(r)),
      stats: { questions: closed.length, avgCorrectRate: closed.length ? rateSum / closed.length : 0 },
    };
  }

  private entry(r: Ranked): LeaderboardEntry {
    return {
      participantId: r.pid,
      nickname: this.participants.get(r.pid)!.nickname,
      score: r.score,
      rank: r.rank,
      prevRank: null,
      delta: 0,
      correctCount: r.correctCount,
    };
  }

  finish(): void {
    this.ensurePhase('QUESTION_REVEAL', 'LEADERBOARD');
    if (this.currentIndex !== this.total - 1) throw new AppError('INVALID_TRANSITION');
    const now = this.now();
    this.phase = 'FINAL_RESULTS';
    this.v += 1;
    this.deps.db.tx(() => {
      this.computeFinal(now, true);
      this.persistRoom();
    });
    this.deps.bus.screen(this.id, 'game:final', this.finalPayload);
    this.deps.bus.play(this.id, 'game:final', { ...this.finalPayload!, ranksBeyondPrize: [] });
    this.pushAdminState();
  }

  private prizePayload(rank: number, startAt: number, flipAt: number, revealedCount: number, first: boolean): PrizeRevealPayload {
    const w = this.winners.find((x) => x.rank === rank)!;
    const r = this.finalRanking?.find((x) => x.pid === w.participantId);
    return {
      v: this.v,
      at: startAt,
      rank,
      participantId: w.participantId,
      nickname: w.nickname,
      score: w.score,
      correctCount: r?.correctCount ?? 0,
      kind: ceremonyKind(rank),
      startAt,
      flipAt,
      revealedCount,
      winnerCount: this.winners.length,
      first,
    };
  }

  revealPrize(rank: number): void {
    this.ensurePhase('FINAL_RESULTS', 'PRIZE_REVEAL');
    const expected = nextPrizeRank(this.phaseContext());
    if (expected === null) throw new AppError('INVALID_TRANSITION');
    if (rank !== expected) throw new AppError('STALE');
    const now = this.now();
    const first = this.prizesRevealed === 0;
    const startAt = now + CEREMONY_LEAD_MS + (first ? CEREMONY_OPENING_MS : 0);
    const flipAt = startAt + CEREMONY_TIMING[ceremonyKind(rank)].flipAt;
    this.prizesRevealed += 1;
    this.phase = 'PRIZE_REVEAL';
    this.v += 1;
    this.persistRoom();
    const payload = this.prizePayload(rank, startAt, flipAt, this.prizesRevealed, first);
    payload.at = now;
    this.prizes.push(payload);
    this.deps.bus.play(this.id, 'prize:reveal', payload);
    this.deps.bus.screen(this.id, 'prize:reveal', payload);
    this.pushAdminState();
  }

  private buildEnded(at: number): GameEndedPayload {
    return {
      v: this.v,
      at,
      winners: this.winners,
      top: (this.finalRanking ?? []).slice(0, Math.max(10, this.settings.leaderboardSize)).map((r) => this.entry(r)),
    };
  }

  private youFinal(pid: number): YouFinal | null {
    const r = this.finalRanking?.find((x) => x.pid === pid);
    const p = this.participants.get(pid);
    if (!r || !p) return null;
    return {
      rank: r.rank,
      score: r.score,
      correctCount: r.correctCount,
      total: this.finalRanking!.length,
      isWinner: this.winners.some((w) => w.participantId === pid),
      bestStreak: p.bestStreak,
    };
  }

  end(): void {
    this.ensurePhase('FINAL_RESULTS', 'PRIZE_REVEAL');
    this.finishGame();
  }

  private finishGame(): void {
    const now = this.now();
    this.phase = 'ENDED';
    this.v += 1;
    if (!this.finalRanking) this.deps.db.tx(() => this.computeFinal(now, true));
    this.persistRoom({ finishedAt: now });
    this.ended = this.buildEnded(now);
    this.deps.bus.play(this.id, 'game:ended', this.ended);
    this.deps.bus.screen(this.id, 'game:ended', this.ended);
    for (const p of this.activeParticipants()) {
      const yf = this.youFinal(p.id);
      if (yf) this.deps.bus.player(p.id, 'you:final', yf);
    }
    this.pushAdminState();
    this.deps.onEnded?.(this.id);
  }

  abort(): void {
    if (this.phase === 'DRAFT' || this.phase === 'ENDED') throw new AppError('INVALID_TRANSITION');
    if (this.timer) {
      this.deps.scheduler.clear(this.timer);
      this.timer = null;
    }
    const q = this.current();
    if (this.phase === 'QUESTION_ACTIVE' && q) {
      const now = this.now();
      q.closedAt = now;
      q.closeReason = 'MANUAL';
      this.deps.db.run('UPDATE room_questions SET closed_at = ?, close_reason = ? WHERE id = ?', now, 'MANUAL', q.id);
    }
    this.finalRanking = null;
    this.applyAggregates(this.aggregate(this.lastClosedIndex()));
    this.finishGame();
  }

  reset(): void {
    if (this.phase === 'DRAFT') throw new AppError('INVALID_TRANSITION');
    if (this.timer) {
      this.deps.scheduler.clear(this.timer);
      this.timer = null;
    }
    const now = this.now();
    this.deps.db.tx(() => {
      this.deps.db.run('DELETE FROM answers WHERE room_question_id IN (SELECT id FROM room_questions WHERE room_id = ?)', this.id);
      this.deps.db.run('DELETE FROM participants WHERE room_id = ?', this.id);
      this.deps.db.run(
        'UPDATE room_questions SET started_at = NULL, opens_at = NULL, ends_at = NULL, closed_at = NULL, close_reason = NULL WHERE room_id = ?',
        this.id,
      );
      this.deps.db.run('UPDATE rooms SET started_at = NULL, finished_at = NULL WHERE id = ?', this.id);
      this.phase = 'LOBBY';
      this.currentIndex = -1;
      this.prizesRevealed = 0;
      this.startedAt = null;
      this.v += 1;
      this.persistRoom();
    });
    for (const q of this.questions) {
      q.startedAt = q.opensAt = q.endsAt = q.closedAt = null;
      q.closeReason = null;
      this.answers.set(q.id, new Map());
      this.seq.set(q.id, 0);
      this.correctCounter.set(q.id, 0);
    }
    this.participants.clear();
    this.rosterAdded = [];
    this.rosterRemoved = [];
    this.lastReveal = null;
    this.lastResults.clear();
    this.lastLeaderboard = null;
    this.finalRanking = null;
    this.finalPayload = null;
    this.winners = [];
    this.prizes = [];
    this.ended = null;
    this.deps.bus.play(this.id, 'room:reset', { v: this.v, at: now });
    this.deps.bus.disconnectRoomPlayers(this.id);
    this.deps.bus.screen(this.id, 'state:sync', this.screenSnapshot());
    this.pushAdminState();
    this.flushRoster();
  }

  /** Room is going back to draft: tell connected players and drop them (no DB changes here). */
  evictPlayers(): void {
    this.deps.bus.play(this.id, 'room:reset', { v: this.v + 1, at: this.now() });
    this.deps.bus.disconnectRoomPlayers(this.id);
  }

  setScreenView(view: ScreenView): void {
    this.screenView = view;
    this.deps.db.run('UPDATE rooms SET screen_view = ? WHERE id = ?', view, this.id);
    this.deps.bus.screen(this.id, 'screen:view', { view });
    this.pushAdminState();
  }

  /* ------------------------------------------------------------------ */
  /* Snapshots                                                           */
  /* ------------------------------------------------------------------ */

  private currentState(forPhone: boolean) {
    const q = this.current();
    if (!q || !['QUESTION_ACTIVE', 'QUESTION_REVEAL', 'LEADERBOARD'].includes(this.phase) || q.startedAt === null) return null;
    return {
      question: publicQuestion(q, this.total, forPhone ? this.settings.showQuestionOnDevices : true),
      timing: { startedAt: q.startedAt, opensAt: q.opensAt!, endsAt: q.endsAt! },
      ...this.counts(q),
    };
  }

  playSnapshot(pid: number): PlaySnapshot {
    const p = this.participants.get(pid);
    if (!p || p.kicked) throw new AppError('KICKED');
    const cur = this.currentState(true);
    const inReveal = this.phase === 'QUESTION_REVEAL' || this.phase === 'LEADERBOARD';
    const ceremony = this.phase === 'FINAL_RESULTS' || this.phase === 'PRIZE_REVEAL' || this.phase === 'ENDED';
    const standings = this.currentState(true) ? this.buildStandings(this.lastReveal?.at ?? this.now()) : null;
    return {
      v: this.v,
      at: this.now(),
      room: this.roomInfo(),
      me: { id: p.id, nickname: p.nickname, score: p.score, correctCount: p.correctCount, streak: p.streak },
      roster: this.rosterEntries(),
      rosterCount: this.activeParticipants().length,
      current: cur ? { ...cur, myAnswer: this.phase === 'QUESTION_ACTIVE' ? this.myAnswer(pid) : null } : null,
      reveal: inReveal ? this.lastReveal : null,
      you: inReveal ? (this.lastResults.get(pid) ?? null) : null,
      leaderboard: this.phase === 'LEADERBOARD' ? this.lastLeaderboard : null,
      standings: standings ? { ...standings, myRank: this.currentRanking().find((r) => r.pid === pid)?.rank ?? null } : null,
      final: ceremony && this.finalPayload ? { ...this.finalPayload, ranksBeyondPrize: [] } : null,
      prizes: ceremony ? this.prizes : [],
      ended: this.phase === 'ENDED' ? this.ended : null,
      youFinal: this.phase === 'ENDED' ? this.youFinal(pid) : null,
    };
  }

  screenSnapshot(): ScreenSnapshot {
    const ceremony = this.phase === 'FINAL_RESULTS' || this.phase === 'PRIZE_REVEAL' || this.phase === 'ENDED';
    const inReveal = this.phase === 'QUESTION_REVEAL' || this.phase === 'LEADERBOARD';
    return {
      v: this.v,
      at: this.now(),
      room: { ...this.roomInfo(), joinUrl: this.joinUrl() },
      roster: this.rosterEntries(),
      rosterCount: this.activeParticipants().length,
      current: this.currentState(false),
      reveal: inReveal ? this.lastReveal : null,
      leaderboard: this.phase === 'LEADERBOARD' ? this.lastLeaderboard : null,
      final: ceremony ? this.finalPayload : null,
      prizes: ceremony ? this.prizes : [],
      ended: this.phase === 'ENDED' ? this.ended : null,
      view: this.screenView,
    };
  }

  private adminParticipants(): AdminParticipant[] {
    const ranking = this.currentRanking();
    const rankOf = new Map(ranking.map((r) => [r.pid, r.rank]));
    const q = this.current();
    const ans = q && this.phase === 'QUESTION_ACTIVE' ? this.answers.get(q.id) : null;
    return this.activeParticipants()
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        connected: p.sockets > 0,
        score: p.score,
        rank: rankOf.get(p.id) ?? 0,
        correctCount: p.correctCount,
        answeredCurrent: !!ans?.has(p.id),
        joinedAt: p.joinedAt,
      }))
      .sort((a, b) => a.rank - b.rank);
  }

  private adminLive(q: RQ): AdminLive {
    const ans = [...(this.answers.get(q.id)?.values() ?? [])].filter((a) => this.hasParticipant(a.pid));
    return {
      roomQuestionId: q.id,
      ...this.counts(q),
      correctCount: ans.filter((a) => a.correct).length,
      distribution: q.choices.map((c) => ({ choiceId: c.id, count: ans.filter((a) => a.choiceId === c.id).length })),
      recent: ans
        .sort((a, b) => b.seq - a.seq)
        .slice(0, 8)
        .map((a) => ({ nickname: this.participants.get(a.pid)!.nickname, correct: a.correct, elapsedMs: a.elapsedMs })),
    };
  }

  adminSnapshot(): AdminSnapshot {
    const q = this.current();
    const cur = this.currentState(false);
    const ctx = this.phaseContext();
    const questions: AdminQuestionBrief[] = this.questions.map((x) => ({
      roomQuestionId: x.id,
      index: x.position,
      kind: x.kind,
      title: x.title,
      preview: previewText(x.kind, x.body),
      choices: x.choices.map((c) => ({ id: c.id, position: c.position, text: c.text, isCorrect: c.isCorrect })),
      timeLimitMs: x.timeLimitMs,
      multiplier: x.multiplier,
      closed: x.closedAt !== null,
      closeReason: x.closeReason,
    }));
    return {
      v: this.v,
      at: this.now(),
      room: {
        id: this.id,
        title: this.title,
        code: this.code,
        phase: this.phase,
        total: this.total,
        currentIndex: this.currentIndex,
        settings: this.settings,
        prizesRevealed: this.prizesRevealed,
        winnerCount: this.winners.length,
        joinUrl: this.joinUrl(),
        presenterUrl: this.presenterUrl(),
        screenView: this.screenView,
      },
      questions,
      current: cur && q ? { ...cur, correctChoiceIds: [...q.correctIds] } : null,
      live: q && this.phase === 'QUESTION_ACTIVE' ? this.adminLive(q) : null,
      reveal: this.phase === 'QUESTION_REVEAL' || this.phase === 'LEADERBOARD' ? this.lastReveal : null,
      participants: this.adminParticipants(),
      winners: this.winners,
      prizes: this.prizes,
      availableActions: availableActions(ctx),
      primary: primaryAction(ctx),
    };
  }

  private pushAdminState(): void {
    this.deps.bus.admin(this.id, 'admin:state', this.adminSnapshot());
  }
}
