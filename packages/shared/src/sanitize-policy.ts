/**
 * Single allowlist for HTML question bodies, shared by the server sanitizer (sanitize-html)
 * and the client renderer (DOMPurify). Keep both sides in sync by importing from here only.
 */
export const HTML_ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'mark', 'small', 'sub', 'sup', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'hr',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'figure', 'figcaption', 'img', 'ruby', 'rt', 'rp',
] as const;

export const HTML_GLOBAL_ATTRS = ['style', 'class'] as const;

export const HTML_TAG_ATTRS: Record<string, readonly string[]> = {
  img: ['src', 'alt', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

/**
 * Inline style properties that survive sanitizing. Layout-escaping properties (position, z-index,
 * transform, display, float, …) and anything taking url() stay out, so a question body can never
 * draw over the answer buttons or load outside resources.
 */
export const HTML_ALLOWED_STYLE_PROPS = [
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'font-size',
  'line-height',
  'text-align',
  'text-decoration',
  'vertical-align',
  'list-style-type',
  'border-collapse',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'width',
  'max-width',
] as const;

/** Properties whose value must be a list of non-negative lengths (no negative margins, no calc()). */
const LENGTH_PROPS = new Set([
  'font-size', 'line-height', 'border-width', 'border-radius', 'width', 'max-width',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
]);
const LENGTH_TOKEN = /^(auto|0|\d{1,4}(\.\d{1,3})?(px|em|rem|%)?)$/;

function isSafeLength(value: string): boolean {
  const parts = value.trim().toLowerCase().split(/\s+/);
  return parts.length >= 1 && parts.length <= 4 && parts.every((p) => LENGTH_TOKEN.test(p));
}

export const HTML_ALLOWED_CLASSES = ['q-hl', 'q-center', 'q-small'] as const;

/** Uploaded images only (content-addressed file names). */
export const UPLOAD_URL_RE = /^\/uploads\/[a-f0-9]{32}\.(png|jpe?g|gif|webp)$/;

export const HTML_BODY_MAX = 60_000;

export function isSafeStyleValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v.length > 100) return false;
  if (/url\s*\(|expression|javascript:|var\s*\(|@import|\\/.test(v)) return false;
  return /^[#a-z0-9(),.%\s-]+$/.test(v);
}

/** Filter a style attribute down to allowed properties. Returns '' when nothing survives. */
export function filterStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!(HTML_ALLOWED_STYLE_PROPS as readonly string[]).includes(prop) || !isSafeStyleValue(value)) continue;
    if (LENGTH_PROPS.has(prop) && !isSafeLength(value)) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

export function filterClass(cls: string): string {
  return cls
    .split(/\s+/)
    .filter((c) => (HTML_ALLOWED_CLASSES as readonly string[]).includes(c))
    .join(' ');
}

/** Strip tags for previews / plain-text length checks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-4]|dt|dd|tr|caption|figcaption|blockquote|pre)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
