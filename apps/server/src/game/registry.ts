import type { Db } from '../db/driver';
import { RoomEngine, type EngineDeps } from './room-engine';
import type { Bus, Clock, Scheduler } from './runtime';

const ENDED_IDLE_EVICT_MS = 30 * 60_000;

/** Holds one authoritative RoomEngine per confirmed room. */
export class RoomRegistry {
  private readonly engines = new Map<number, RoomEngine>();
  private readonly lastUsed = new Map<number, number>();
  private bus: Bus;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly opts: {
      db: Db;
      clock: Clock;
      scheduler: Scheduler;
      bus: Bus;
      graceMs: number;
      onEnded?: (roomId: number) => void;
    },
  ) {
    this.bus = opts.bus;
  }

  /** The realtime layer is created after the registry; it plugs its bus in here. */
  setBus(bus: Bus): void {
    this.bus = bus;
  }

  private deps(): EngineDeps {
    return {
      db: this.opts.db,
      clock: this.opts.clock,
      scheduler: this.opts.scheduler,
      bus: {
        play: (...a) => this.bus.play(...a),
        player: (...a) => this.bus.player(...a),
        screen: (...a) => this.bus.screen(...a),
        admin: (...a) => this.bus.admin(...a),
        disconnectPlayer: (...a) => this.bus.disconnectPlayer(...a),
        disconnectRoomPlayers: (...a) => this.bus.disconnectRoomPlayers(...a),
      },
      graceMs: this.opts.graceMs,
      onEnded: this.opts.onEnded,
    };
  }

  /** Get the engine for a room, loading it from the DB if needed (null for drafts / missing rooms). */
  get(roomId: number): RoomEngine | null {
    const existing = this.engines.get(roomId);
    if (existing) {
      this.lastUsed.set(roomId, Date.now());
      return existing;
    }
    const row = this.opts.db.get<{ phase: string }>('SELECT phase FROM rooms WHERE id = ?', roomId);
    if (!row || row.phase === 'DRAFT') return null;
    const engine = RoomEngine.load(this.deps(), roomId);
    this.engines.set(roomId, engine);
    this.lastUsed.set(roomId, Date.now());
    engine.resume();
    return engine;
  }

  peek(roomId: number): RoomEngine | null {
    return this.engines.get(roomId) ?? null;
  }

  byCode(code: string): RoomEngine | null {
    const row = this.opts.db.get<{ id: number }>(
      "SELECT id FROM rooms WHERE code = ? AND phase NOT IN ('DRAFT') ORDER BY (phase = 'ENDED'), id DESC LIMIT 1",
      code,
    );
    return row ? this.get(row.id) : null;
  }

  /** Boot recovery: load every live room so timers resume. */
  loadLive(): number {
    const rows = this.opts.db.all<{ id: number }>("SELECT id FROM rooms WHERE phase NOT IN ('DRAFT', 'ENDED')");
    for (const r of rows) this.get(r.id);
    return rows.length;
  }

  dispose(roomId: number): void {
    this.engines.get(roomId)?.dispose();
    this.engines.delete(roomId);
    this.lastUsed.delete(roomId);
  }

  startSweeper(): void {
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, e] of this.engines) {
        if (e.phase === 'ENDED' && now - (this.lastUsed.get(id) ?? 0) > ENDED_IDLE_EVICT_MS) this.dispose(id);
      }
    }, 60_000);
    this.sweepTimer.unref();
  }

  disposeAll(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const id of [...this.engines.keys()]) this.dispose(id);
  }
}
