/**
 * Chart series for the usage dashboard. Categorical slots 1–3 of the reference palette, in fixed
 * order (validated on #ffffff: all-pairs CVD ΔE ≥ 9.2). Slot 3 sits below 3:1 on white, so every
 * chart that uses it also prints values / offers a table.
 */
export const SERIES = {
  questions: { label: '문제', color: '#2a78d6' },
  rooms: { label: '퀴즈방', color: '#eb6834' },
  games: { label: '종료된 게임', color: '#1baf7a' },
} as const;

/** Axis maximum = 4 × a 1/2/3/5×10ⁿ integer step, so the four gridlines land on whole numbers. */
export function niceMax(v: number): number {
  const raw = Math.max(1, v / 4);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 3, 5, 10].map((m) => m * p).find((s) => s >= raw && Number.isInteger(s)) ?? Math.ceil(raw);
  return step * 4;
}

/** 'YYYY-MM-DD' → '11/14' (or '11월 14일 (토)' in long form). The date is already local. */
export function shortDate(iso: string, long = false): string {
  const [y, mo, d] = iso.split('-').map(Number) as [number, number, number];
  if (!long) return `${mo}/${d}`;
  const wd = '일월화수목금토'[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${mo}월 ${d}일 (${wd})`;
}
