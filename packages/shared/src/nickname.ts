export const NICKNAME_MAX = 12;

const ZERO_WIDTH = /[​-‍⁠﻿­᠎]/g;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

let segmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter | null {
  if (segmenter) return segmenter;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  }
  return segmenter;
}

/** Split into user-perceived characters (grapheme clusters). */
export function graphemes(s: string): string[] {
  const seg = getSegmenter();
  if (seg) return Array.from(seg.segment(s), (x) => x.segment);
  return Array.from(s);
}

export function graphemeLength(s: string): number {
  return graphemes(s).length;
}

export function firstGrapheme(s: string): string {
  return graphemes(s.trim())[0] ?? '?';
}

export function normalizeNickname(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Comparison key: visually-similar nicknames collide (width, case, spaces). */
export function nicknameKey(nickname: string): string {
  return normalizeNickname(nickname).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export type NicknameCheck = { ok: true; value: string } | { ok: false };

export function validateNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== 'string') return { ok: false };
  const value = normalizeNickname(raw);
  const len = graphemeLength(value);
  if (len < 1 || len > NICKNAME_MAX) return { ok: false };
  return { ok: true, value };
}
