/** Card slot geometry for the prize ceremony, in stage rem (stage = 120 × 67.5). */
export interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
  variant: 'card' | 'row';
  row: 0 | 1;
}

export const STAGE_W = 120;
export const STAGE_H = 67.5;

export const MEDAL: Record<number, { bg: string; fg: string; name: string }> = {
  1: { bg: '#FFC233', fg: '#17153B', name: '금' },
  2: { bg: '#CDD3E0', fg: '#17153B', name: '은' },
  3: { bg: '#E3A06A', fg: '#17153B', name: '동' },
};

export function medal(rank: number) {
  return MEDAL[rank] ?? { bg: '#17153B', fg: '#FFFFFF', name: '' };
}

/** Rank 1 in the middle, then alternating left/right: [4, 2, 1, 3, 5]. */
export function podiumOrder(ranks: number[]): number[] {
  const out: number[] = [];
  [...ranks]
    .sort((a, b) => a - b)
    .forEach((r, i) => {
      if (i === 0) out.push(r);
      else if (i % 2 === 1) out.unshift(r);
      else out.push(r);
    });
  return out;
}

function rowSlots(ranks: number[], w: number, h: number, gap: number, y: number, row: 0 | 1, out: Map<number, Slot>) {
  const total = ranks.length * w + (ranks.length - 1) * gap;
  const x0 = (STAGE_W - total) / 2;
  ranks.forEach((r, i) => out.set(r, { x: x0 + i * (w + gap), y, w, h, variant: 'card', row }));
}

/** Face-down cards during the ceremony: one podium-ordered row (≤5) or top-3 + the rest below. */
export function ceremonySlots(count: number): Map<number, Slot> {
  const out = new Map<number, Slot>();
  const ranks = Array.from({ length: count }, (_, i) => i + 1);
  if (count <= 5) {
    rowSlots(podiumOrder(ranks), 18, 24, 3, 24, 0, out);
  } else {
    rowSlots(podiumOrder(ranks.slice(0, 3)), 17, 22, 3, 12.5, 0, out);
    rowSlots(ranks.slice(3), 12, 15.5, 2, 38.5, 1, out);
  }
  return out;
}

/**
 * Grand reveal: rank 1 moves to the stage centre; cards in the same row are pushed further out,
 * cards in the other row sink below.
 */
export function grandSlotOf(grand: Slot): Slot {
  return { ...grand, x: STAGE_W / 2 - grand.w / 2 };
}

export function grandShift(slot: Slot, grand: Slot): { dx: number; dy: number } {
  if (slot.row !== grand.row) return { dx: 0, dy: 16 };
  const moved = grandSlotOf(grand);
  const dxG = moved.x - grand.x;
  return { dx: dxG + (slot.x < grand.x ? -10 : 10), dy: 0 };
}

export const PODIUM_BLOCK: Record<number, number> = { 1: 17, 2: 12.5, 3: 9 };
const PODIUM_BOTTOM = 64;

/** Final "winners wall": podium for the top 3, compact rows for the rest. */
export function wallSlots(count: number): { slots: Map<number, Slot>; podium: { rank: number; x: number; w: number; h: number }[] } {
  const slots = new Map<number, Slot>();
  const podium: { rank: number; x: number; w: number; h: number }[] = [];
  const w = count > 3 ? 15 : 17;
  const h = count > 3 ? 19 : 22;
  const centers: Record<number, number> =
    count > 3 ? { 2: 20, 1: 38, 3: 56 } : count === 3 ? { 2: 41, 1: 60, 3: 79 } : count === 2 ? { 2: 50.5, 1: 69.5 } : { 1: 60 };
  for (let r = 1; r <= Math.min(3, count); r++) {
    const bh = PODIUM_BLOCK[r]!;
    const cx = centers[r]!;
    slots.set(r, { x: cx - w / 2, y: PODIUM_BOTTOM - bh - 0.75 - h, w, h, variant: 'card', row: 0 });
    podium.push({ rank: r, x: cx - (w + 2) / 2, w: w + 2, h: bh });
  }
  const others = Array.from({ length: Math.max(0, count - 3) }, (_, i) => i + 4);
  const twoCols = others.length > 4;
  others.forEach((r, i) => {
    const col = twoCols ? Math.floor(i / Math.ceil(others.length / 2)) : 0;
    const idx = twoCols ? i % Math.ceil(others.length / 2) : i;
    const rw = twoCols ? 23 : 36;
    slots.set(r, { x: 72 + col * (rw + 2), y: 18 + idx * 7.5, w: rw, h: 6.25, variant: 'row', row: 1 });
  });
  return { slots, podium };
}
