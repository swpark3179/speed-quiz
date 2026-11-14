import type { AdminDto, AdminRole } from '@sq/shared';
import type { Db } from '../driver';

export interface AdminRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: AdminRole;
  disabled: number;
  created_at: number;
  last_login_at: number | null;
}

export function toAdminDto(r: AdminRow): AdminDto {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    disabled: !!r.disabled,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  };
}

export const adminsRepo = {
  count(db: Db): number {
    return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM admins')!.n;
  },
  byUsername(db: Db, username: string): AdminRow | undefined {
    return db.get<AdminRow>('SELECT * FROM admins WHERE username = ?', username);
  },
  byId(db: Db, id: number): AdminRow | undefined {
    return db.get<AdminRow>('SELECT * FROM admins WHERE id = ?', id);
  },
  list(db: Db): AdminRow[] {
    return db.all<AdminRow>('SELECT * FROM admins ORDER BY id');
  },
  insert(db: Db, a: { username: string; displayName: string; passwordHash: string; role?: AdminRole }): number {
    return db.run(
      'INSERT INTO admins (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
      a.username,
      a.displayName,
      a.passwordHash,
      a.role ?? 'ADMIN',
      Date.now(),
    ).lastInsertRowid;
  },
  setPassword(db: Db, id: number, hash: string): void {
    db.run('UPDATE admins SET password_hash = ? WHERE id = ?', hash, id);
  },
  update(db: Db, id: number, patch: { displayName?: string; disabled?: boolean }): void {
    if (patch.displayName !== undefined) db.run('UPDATE admins SET display_name = ? WHERE id = ?', patch.displayName, id);
    if (patch.disabled !== undefined) db.run('UPDATE admins SET disabled = ? WHERE id = ?', patch.disabled ? 1 : 0, id);
  },
  touchLogin(db: Db, id: number): void {
    db.run('UPDATE admins SET last_login_at = ? WHERE id = ?', Date.now(), id);
  },
};
