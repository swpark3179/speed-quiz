import { firstGrapheme } from '@sq/shared';

const AVATAR_COLORS = [
  '#FFD6D1',
  '#FFE3B8',
  '#FFF1A8',
  '#D9F5C5',
  '#C6F0E4',
  '#C9ECFA',
  '#D4E0FF',
  '#E2D7FF',
  '#F6D3F2',
  '#FFD3E2',
  '#E8E1D3',
  '#D7DEE8',
];

export function avatarColor(id: number): string {
  const h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function initial(name: string): string {
  return firstGrapheme(name).toUpperCase();
}

export const num = (n: number) => n.toLocaleString('ko-KR');

export function seconds(ms: number | null | undefined, digits = 1): string {
  if (ms === null || ms === undefined) return '-';
  return `${(ms / 1000).toFixed(digits)}초`;
}

export function dateTime(ts: number | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
