/** Prize ceremony timing shared by server (flipAt calculation) and clients (animation beats). */
export type CeremonyKind = 'quick' | 'standard' | 'grand';

export function ceremonyKind(rank: number): CeremonyKind {
  if (rank === 1) return 'grand';
  if (rank <= 3) return 'standard';
  return 'quick';
}

/** ms offsets relative to the reveal start (after the opening on the first reveal). */
export const CEREMONY_TIMING: Record<CeremonyKind, { flipAt: number; total: number }> = {
  quick: { flipAt: 1300, total: 2400 },
  standard: { flipAt: 2000, total: 3600 },
  grand: { flipAt: 3100, total: 6500 },
};

/** Opening sequence (lights down, title, cards dealt) before the first reveal. */
export const CEREMONY_OPENING_MS = 2200;

/** Lead time the server adds so every screen starts the step at the same instant. */
export const CEREMONY_LEAD_MS = 300;

/** Reveal beat on participant phones relative to question:reveal `at` (keeps phones from spoiling the screen). */
export const REVEAL_HIGHLIGHT_MS = 1200;
