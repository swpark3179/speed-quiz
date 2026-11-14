/**
 * Single allowlist for HTML question bodies, shared by the server sanitizer (sanitize-html)
 * and the client renderer (DOMPurify). Keep both sides in sync by importing from here only.
 */
export const HTML_ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'mark', 'small', 'sub', 'sup', 'span', 'div',
  'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'ruby', 'rt', 'rp',
] as const;

export const HTML_GLOBAL_ATTRS = ['style', 'class'] as const;

export const HTML_TAG_ATTRS: Record<string, readonly string[]> = {
  img: ['src', 'alt', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

export const HTML_ALLOWED_STYLE_PROPS = [
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-align',
  'text-decoration',
] as const;

export const HTML_ALLOWED_CLASSES = ['q-hl', 'q-center', 'q-small'] as const;

/** Uploaded images only (content-addressed file names). */
export const UPLOAD_URL_RE = /^\/uploads\/[a-f0-9]{32}\.(png|jpe?g|gif|webp)$/;

export const HTML_BODY_MAX = 20_000;

export function isSafeStyleValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v.length > 64) return false;
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
    if ((HTML_ALLOWED_STYLE_PROPS as readonly string[]).includes(prop) && isSafeStyleValue(value)) {
      out.push(`${prop}: ${value}`);
    }
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
    .replace(/<\/(p|div|li|h3|h4|tr|blockquote|pre)>/gi, ' ')
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
