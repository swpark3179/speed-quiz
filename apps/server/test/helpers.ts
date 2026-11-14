import type { QuestionInput, RoomSettingsInput } from '@sq/shared';
import { DEFAULT_ROOM_SETTINGS, QuestionInput as QuestionInputSchema, RoomSettings } from '@sq/shared';
import { Db } from '../src/db/driver';
import { migrate } from '../src/db/migrations';
import { RoomRegistry } from '../src/game/registry';
import type { Bus, Clock, Scheduler } from '../src/game/runtime';
import { QuestionService } from '../src/services/question-service';
import { RoomService } from '../src/services/room-service';

export class FakeClock implements Clock {
  t = 1_700_000_000_000;
  now(): number {
    return this.t;
  }
}

export class FakeScheduler implements Scheduler {
  private seq = 0;
  private tasks = new Map<number, { at: number; fn: () => void }>();
  constructor(private readonly clock: FakeClock) {}
  set(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.tasks.set(id, { at: this.clock.t + Math.max(0, ms), fn });
    return id;
  }
  clear(handle: unknown): void {
    this.tasks.delete(handle as number);
  }
  /** Advance time, running due tasks in order. */
  advance(ms: number): void {
    const target = this.clock.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.tasks) if (e[1].at <= target && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.tasks.delete(next[0]);
      this.clock.t = Math.max(this.clock.t, next[1].at);
      next[1].fn();
    }
    this.clock.t = target;
  }
}

export interface Recorded {
  ns: 'play' | 'player' | 'screen' | 'admin';
  id: number;
  event: string;
  payload: unknown;
}

export class RecordingBus implements Bus {
  events: Recorded[] = [];
  disconnected: number[] = [];
  play(id: number, event: string, payload?: unknown) {
    this.events.push({ ns: 'play', id, event, payload });
  }
  player(id: number, event: string, payload?: unknown) {
    this.events.push({ ns: 'player', id, event, payload });
  }
  screen(id: number, event: string, payload?: unknown) {
    this.events.push({ ns: 'screen', id, event, payload });
  }
  admin(id: number, event: string, payload?: unknown) {
    this.events.push({ ns: 'admin', id, event, payload });
  }
  disconnectPlayer(pid: number) {
    this.disconnected.push(pid);
  }
  disconnectRoomPlayers() {}
  last(event: string, ns?: Recorded['ns']): Recorded | undefined {
    return [...this.events].reverse().find((e) => e.event === event && (!ns || e.ns === ns));
  }
  of(event: string, ns?: Recorded['ns']): Recorded[] {
    return this.events.filter((e) => e.event === event && (!ns || e.ns === ns));
  }
}

export function setupWorld(dbFile = ':memory:') {
  const db = new Db(dbFile);
  migrate(db);
  const clock = new FakeClock();
  const scheduler = new FakeScheduler(clock);
  const bus = new RecordingBus();
  const registry = new RoomRegistry({ db, clock, scheduler, bus, graceMs: 300 });
  const questions = new QuestionService(db);
  const rooms = new RoomService(db, registry);
  const adminId = db.run(
    "INSERT INTO admins (username, display_name, password_hash, created_at) VALUES ('t', 'tester', 'x', 0)",
  ).lastInsertRowid;
  return { db, clock, scheduler, bus, registry, questions, rooms, adminId };
}

export type World = ReturnType<typeof setupWorld>;

export function makeQuestion(w: World, partial: Partial<QuestionInput> = {}, correctIndex = 0, choiceCount = 4) {
  const input = QuestionInputSchema.parse({
    kind: 'TEXT',
    body: '다음 중 정답은?',
    choices: Array.from({ length: choiceCount }, (_, i) => ({ text: `보기 ${i + 1}`, isCorrect: i === correctIndex })),
    ...partial,
  });
  return w.questions.create(input, w.adminId);
}

export function makeRoom(w: World, questionIds: number[], settings: RoomSettingsInput = {}) {
  const room = w.rooms.create(
    {
      title: '테스트 방',
      settings: RoomSettings.parse({ ...DEFAULT_ROOM_SETTINGS, ...settings }),
      items: questionIds.map((id) => ({ questionId: id, timeLimitSec: null, multiplier: 1 })),
    },
    w.adminId,
  );
  const confirm = w.rooms.confirm(room.id, 'http://quiz.test');
  const engine = w.registry.get(room.id)!;
  return { room, confirm, engine };
}

/** Insert another (regular) admin and return its id. */
export function addAdmin(w: World, username: string): number {
  return w.db.run(
    "INSERT INTO admins (username, display_name, password_hash, created_at) VALUES (?, ?, 'x', 0)",
    username,
    username,
  ).lastInsertRowid;
}
