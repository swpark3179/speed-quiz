/** Estimates the offset between this device and the server so countdowns end together everywhere. */
interface Pingable {
  timeout(ms: number): { emitWithAck(ev: 'time:ping'): Promise<number> };
}

class ServerClock {
  offset = 0;
  rtt = Number.POSITIVE_INFINITY;
  private listeners = new Set<() => void>();

  now(): number {
    return Date.now() + this.offset;
  }

  /** offset = serverNow − (t0 + rtt/2), keeping the lowest-RTT sample. */
  static estimate(samples: { t0: number; t1: number; server: number }[]): { offset: number; rtt: number } | null {
    let best: { offset: number; rtt: number } | null = null;
    for (const s of samples) {
      const rtt = s.t1 - s.t0;
      if (rtt < 0) continue;
      const offset = s.server - (s.t0 + rtt / 2);
      if (!best || rtt < best.rtt) best = { offset, rtt };
    }
    return best;
  }

  async sync(socket: Pingable, count = 5): Promise<void> {
    const samples: { t0: number; t1: number; server: number }[] = [];
    for (let i = 0; i < count; i++) {
      const t0 = Date.now();
      try {
        const server = await (socket as unknown as Pingable).timeout(3000).emitWithAck('time:ping');
        samples.push({ t0, t1: Date.now(), server });
      } catch {
        /* lost ping */
      }
    }
    const best = ServerClock.estimate(samples);
    if (best) {
      this.offset = best.offset;
      this.rtt = best.rtt;
      for (const l of this.listeners) l();
    }
  }

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const serverClock = new ServerClock();
export { ServerClock };
