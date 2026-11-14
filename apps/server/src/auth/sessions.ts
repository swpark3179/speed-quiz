import type { Db } from '../db/driver';
import { adminsRepo } from '../db/repos/admins';
import { newToken, sha256 } from './tokens';

export const SESSION_COOKIE = 'sq_admin';

export interface SessionAdmin {
  id: number;
  username: string;
  displayName: string;
  sessionHash: string;
}

type RevokeListener = (sessionHash: string) => void;

export class SessionStore {
  private listeners = new Set<RevokeListener>();

  constructor(
    private readonly db: Db,
    private readonly ttlMs: number,
  ) {}

  create(adminId: number): string {
    const token = newToken();
    const now = Date.now();
    this.db.run(
      'INSERT INTO sessions (id_hash, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      sha256(token),
      adminId,
      now,
      now + this.ttlMs,
    );
    return token;
  }

  /** Validate a session token; extends the sliding expiry. */
  lookup(token: string | undefined | null): SessionAdmin | null {
    if (!token) return null;
    const hash = sha256(token);
    const row = this.db.get<{ admin_id: number; expires_at: number }>(
      'SELECT admin_id, expires_at FROM sessions WHERE id_hash = ?',
      hash,
    );
    const now = Date.now();
    if (!row || row.expires_at < now) {
      if (row) this.db.run('DELETE FROM sessions WHERE id_hash = ?', hash);
      return null;
    }
    const admin = adminsRepo.byId(this.db, row.admin_id);
    if (!admin || admin.disabled) return null;
    if (row.expires_at - now < this.ttlMs - 5 * 60_000) {
      this.db.run('UPDATE sessions SET expires_at = ? WHERE id_hash = ?', now + this.ttlMs, hash);
    }
    return { id: admin.id, username: admin.username, displayName: admin.display_name, sessionHash: hash };
  }

  revoke(token: string): void {
    const hash = sha256(token);
    this.db.run('DELETE FROM sessions WHERE id_hash = ?', hash);
    for (const l of this.listeners) l(hash);
  }

  revokeAllFor(adminId: number, exceptHash?: string): void {
    const rows = this.db.all<{ id_hash: string }>('SELECT id_hash FROM sessions WHERE admin_id = ?', adminId);
    for (const r of rows) {
      if (r.id_hash === exceptHash) continue;
      this.db.run('DELETE FROM sessions WHERE id_hash = ?', r.id_hash);
      for (const l of this.listeners) l(r.id_hash);
    }
  }

  purgeExpired(): void {
    this.db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  }

  onRevoke(l: RevokeListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
