import sanitizeHtml from 'sanitize-html';
import {
  HTML_ALLOWED_TAGS,
  HTML_GLOBAL_ATTRS,
  HTML_TAG_ATTRS,
  UPLOAD_URL_RE,
  filterClass,
  filterStyle,
} from '@sq/shared';

const allowedAttributes: Record<string, string[]> = { '*': [...HTML_GLOBAL_ATTRS] };
for (const [tag, attrs] of Object.entries(HTML_TAG_ATTRS)) allowedAttributes[tag] = [...attrs];

/** Server-side sanitizer for HTML question bodies (same allowlist as the client's DOMPurify config). */
export function sanitizeQuestionHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...HTML_ALLOWED_TAGS],
    allowedAttributes,
    allowedSchemes: [],
    allowedSchemesByTag: {},
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'iframe', 'svg', 'math'],
    transformTags: {
      '*': (tagName, attribs) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(attribs)) {
          if (k === 'style') {
            const s = filterStyle(v);
            if (s) out.style = s;
          } else if (k === 'class') {
            const c = filterClass(v);
            if (c) out.class = c;
          } else if (k === 'width' || k === 'height' || k === 'colspan' || k === 'rowspan') {
            if (/^\d{1,4}$/.test(v)) out[k] = v;
          } else {
            out[k] = v;
          }
        }
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !UPLOAD_URL_RE.test(frame.attribs.src ?? ''),
  });
}
