import DOMPurify from 'dompurify';
import {
  HTML_ALLOWED_TAGS,
  HTML_GLOBAL_ATTRS,
  HTML_TAG_ATTRS,
  UPLOAD_URL_RE,
  filterClass,
  filterStyle,
} from '@sq/shared';

const ALLOWED_ATTR = [...new Set([...HTML_GLOBAL_ATTRS, ...Object.values(HTML_TAG_ATTRS).flat()])];

let purifier: ReturnType<typeof DOMPurify> | null = null;

function getPurifier() {
  if (purifier) return purifier;
  const p = DOMPurify(window);
  p.addHook('uponSanitizeAttribute', (_node, data) => {
    const name = data.attrName;
    if (name === 'style') {
      data.attrValue = filterStyle(data.attrValue);
      if (!data.attrValue) data.keepAttr = false;
    } else if (name === 'class') {
      data.attrValue = filterClass(data.attrValue);
      if (!data.attrValue) data.keepAttr = false;
    } else if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan') {
      if (!/^\d{1,4}$/.test(data.attrValue)) data.keepAttr = false;
    }
  });
  p.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'IMG' && !UPLOAD_URL_RE.test(node.getAttribute('src') ?? '')) node.remove();
  });
  purifier = p;
  return p;
}

const cache = new Map<string, string>();

/** Client-side sanitizer for HTML question bodies (same allowlist as the server). */
export function sanitizeHtml(html: string): string {
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  const out = getPurifier().sanitize(html, {
    ALLOWED_TAGS: [...HTML_ALLOWED_TAGS],
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  }) as string;
  if (cache.size > 200) cache.clear();
  cache.set(html, out);
  return out;
}
