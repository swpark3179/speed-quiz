/** Participant credentials per room code (survives reloads so a phone resumes as the same person). */
export interface PlayerSession {
  participantId: number;
  token: string;
  nickname: string;
  roomId: number;
  code: string;
  title: string;
}

const key = (code: string) => `sq.p.${code}`;
const NICK_KEY = 'sq.lastNickname';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadSession(code: string): PlayerSession | null {
  return safe(() => {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as PlayerSession) : null;
  }, null);
}

export function saveSession(s: PlayerSession): void {
  safe(() => {
    localStorage.setItem(key(s.code), JSON.stringify(s));
    localStorage.setItem(NICK_KEY, s.nickname);
  }, undefined);
}

export function clearSession(code: string): void {
  safe(() => localStorage.removeItem(key(code)), undefined);
}

export function lastNickname(): string {
  return safe(() => localStorage.getItem(NICK_KEY) ?? '', '');
}
