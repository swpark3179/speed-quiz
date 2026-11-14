import { HTML_BODY_MAX, filterStyle } from '@sq/shared';

/**
 * Converts an HTML "bundle" (index.html + css + images, as loose files, a folder or a .zip) into the
 * single sanitized HTML fragment that question bodies already use.
 *
 * Nothing here is a security boundary: scripts never run (DOMParser documents are inert), and the
 * result still goes through the shared allowlist on the client (DOMPurify) and on the server
 * (sanitize-html) when saved. This module only rescues what the allowlist can express — inline
 * styles and uploaded images — and reports what had to be dropped.
 */

export interface BundleFile {
  /** Path inside the bundle, '/'-separated, no leading './' (e.g. 'quiz/img/a.png'). */
  path: string;
  data: Blob;
}

export interface ImportReport {
  entry: string;
  imagesUploaded: number;
  stylesApplied: number;
  scripts: number;
  eventHandlers: number;
  /** iframe / object / form / video / svg … elements removed with their content. */
  embeds: number;
  externalImages: number;
  missingImages: number;
  failedImages: number;
  externalStylesheets: number;
  /** @import / @media / @font-face / @keyframes / ::before … rules that cannot be inlined. */
  unsupportedCssRules: number;
  /** Declarations outside the style allowlist (position, display, background-image, …). */
  droppedDeclarations: number;
  length: number;
  tooLong: boolean;
}

export interface ImportDeps {
  upload: (file: File) => Promise<{ url: string }>;
  sanitize: (html: string) => string;
}

const HTML_RE = /\.html?$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const REMOVE_WITH_CONTENT =
  'iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, video, audio, canvas, svg, math, template, noscript, dialog';

/* ------------------------------------------------------------------ */
/* Reading input                                                       */
/* ------------------------------------------------------------------ */

export function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

/** Expands a file picker / drop selection into bundle files (zips are unpacked, folders keep their paths). */
export async function filesFromSelection(list: Iterable<File>): Promise<BundleFile[]> {
  const out: BundleFile[] = [];
  for (const f of list) {
    if (/\.zip$/i.test(f.name)) {
      const { unzipSync } = await import('fflate');
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), {
        // skip macOS metadata and anything that could not be part of a question
        filter: (e) => !e.name.startsWith('__MACOSX/') && !e.name.endsWith('/') && /\.(html?|css|png|jpe?g|gif|webp)$/i.test(e.name),
      });
      for (const [name, bytes] of Object.entries(entries)) out.push({ path: normalizePath(name), data: new Blob([bytes as BlobPart]) });
    } else {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      out.push({ path: normalizePath(rel), data: f });
    }
  }
  return out;
}

export function pickEntry(files: BundleFile[]): BundleFile | null {
  const html = files.filter((f) => HTML_RE.test(f.path));
  if (!html.length) return null;
  const depth = (p: string) => p.split('/').length;
  const index = html.filter((f) => /(^|\/)index\.html?$/i.test(f.path)).sort((a, b) => depth(a.path) - depth(b.path));
  return index[0] ?? html.sort((a, b) => depth(a.path) - depth(b.path))[0]!;
}

async function readText(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // honour a declared legacy charset (EUC-KR exports are common); default to UTF-8
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 2048));
  const label = /charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  try {
    return new TextDecoder(label || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

/* ------------------------------------------------------------------ */
/* CSS → inline styles                                                 */
/* ------------------------------------------------------------------ */

type Specificity = [number, number, number];

/** Approximate selector specificity (ids, classes/attributes/pseudo-classes, types). */
export function specificity(selector: string): Specificity {
  const s = selector.replace(/\([^)]*\)/g, '()');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(\(\))?/g, ' ').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return [ids, classes, types];
}

function cmpSpec(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Split a selector list on top-level commas. */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Split a declaration block (`a: b; c: d !important`) into parts, ignoring ';' inside parentheses/quotes. */
export function parseDeclarations(css: string): { prop: string; value: string; important: boolean }[] {
  const out: { prop: string; value: string; important: boolean }[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  const flush = () => {
    const idx = cur.indexOf(':');
    if (idx > 0) {
      const prop = cur.slice(0, idx).trim().toLowerCase();
      let value = cur.slice(idx + 1).trim();
      const important = /!\s*important\s*$/i.test(value);
      if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
      if (prop && value) out.push({ prop, value, important });
    }
    cur = '';
  };
  for (const ch of css) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) {
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

const COLOR_ONLY = /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;

/** Returns the allowlisted form of one declaration, or null when it cannot be kept. */
function allowDeclaration(prop: string, value: string): { prop: string; value: string } | null {
  // `background: #eee` is the usual way to set a cell colour — keep it as background-color
  if (prop === 'background' && COLOR_ONLY.test(value.trim())) prop = 'background-color';
  const kept = filterStyle(`${prop}: ${value}`);
  if (!kept) return null;
  const idx = kept.indexOf(':');
  return { prop: kept.slice(0, idx), value: kept.slice(idx + 1).trim() };
}

export interface CssRule {
  /** null for at-rules (@media, @font-face, @import, …) which cannot be inlined. */
  selector: string | null;
  body: string;
}

/**
 * Minimal top-level CSS rule splitter. Shorthands stay as written (a browser CSSOM would expand
 * `border:` into longhands), comments are dropped, nested at-rule blocks are skipped as one rule.
 */
export function parseCssRules(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    const semi = text.indexOf(';', i);
    const prelude = text.slice(i, open < 0 ? undefined : open).trim();
    // statement at-rule without a block (@import url(x); @charset "utf-8";)
    if (prelude.startsWith('@') && semi >= 0 && (open < 0 || semi < open)) {
      rules.push({ selector: null, body: '' });
      i = semi + 1;
      continue;
    }
    if (open < 0) break;
    let depth = 1;
    let j = open + 1;
    let quote = '';
    for (; j < text.length && depth > 0; j++) {
      const ch = text[j];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const body = text.slice(open + 1, j - 1);
    rules.push({ selector: prelude.startsWith('@') || !prelude ? null : prelude, body });
    i = j;
  }
  return rules;
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

function dataUriToBlob(uri: string): Blob | null {
  const m = /^data:(image\/(png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(uri.trim());
  if (!m) return null;
  try {
    const bin = atob(m[3]!.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

export async function importHtmlBundle(files: BundleFile[], deps: ImportDeps): Promise<{ html: string; report: ImportReport }> {
  const entry = pickEntry(files);
  if (!entry) throw new Error('HTML 파일(.html)이 없어요. index.html을 포함해 주세요.');
  const byPath = new Map(files.map((f) => [f.path.toLowerCase(), f]));
  const baseDir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/') + 1) : '';
  const resolve = (ref: string, from = baseDir): BundleFile | undefined => {
    let clean = ref.split(/[?#]/)[0]!;
    try {
      clean = decodeURIComponent(clean);
    } catch {
      /* keep raw */
    }
    const p = clean.startsWith('/') ? normalizePath(clean) : normalizePath(from + clean);
    return byPath.get(p.toLowerCase());
  };
  const isExternal = (ref: string) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref.trim());

  const report: ImportReport = {
    entry: entry.path,
    imagesUploaded: 0,
    stylesApplied: 0,
    scripts: 0,
    eventHandlers: 0,
    embeds: 0,
    externalImages: 0,
    missingImages: 0,
    failedImages: 0,
    externalStylesheets: 0,
    unsupportedCssRules: 0,
    droppedDeclarations: 0,
    length: 0,
    tooLong: false,
  };

  const doc = new DOMParser().parseFromString(await readText(entry.data), 'text/html');

  /* 1. scripts, handlers, embedded/interactive content */
  doc.querySelectorAll('script').forEach((el) => {
    report.scripts++;
    el.remove();
  });
  doc.querySelectorAll(REMOVE_WITH_CONTENT).forEach((el) => {
    report.embeds++;
    el.remove();
  });
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) {
        report.eventHandlers++;
        el.removeAttribute(attr.name);
      }
    }
  });

  /* 2. stylesheets (document order) → per-element winning declarations */
  const sheets: ({ text: string } | { file: BundleFile })[] = [];
  doc.querySelectorAll('link[rel~="stylesheet" i], style').forEach((el) => {
    if (el.tagName === 'STYLE') {
      sheets.push({ text: el.textContent ?? '' });
    } else {
      const href = el.getAttribute('href') ?? '';
      const file = href && !isExternal(href) ? resolve(href) : undefined;
      if (file) sheets.push({ file });
      else report.externalStylesheets++;
    }
    el.remove();
  });
  // leftover <link>/<meta>/<base> carry nothing we can use
  doc.querySelectorAll('link, meta, base').forEach((el) => el.remove());

  type Winner = { value: string; important: boolean; spec: Specificity; order: number };
  const computed = new Map<Element, Map<string, Winner>>();
  let order = 0;
  const offer = (el: Element, prop: string, value: string, important: boolean, spec: Specificity) => {
    let props = computed.get(el);
    if (!props) computed.set(el, (props = new Map()));
    const cur = props.get(prop);
    const o = order++;
    if (!cur || (important && !cur.important) || (important === cur.important && cmpSpec(spec, cur.spec) >= 0)) {
      props.set(prop, { value, important, spec, order: o });
    }
  };

  for (const sheet of sheets) {
    const text = 'file' in sheet ? await readText(sheet.file.data) : sheet.text;
    for (const rule of parseCssRules(text)) {
      if (!rule.selector) {
        report.unsupportedCssRules++;
        continue;
      }
      const decls = parseDeclarations(rule.body);
      for (const sel of splitSelectors(rule.selector)) {
        if (/::|:(hover|focus|active|visited|link|before|after|target|checked)/i.test(sel)) {
          report.unsupportedCssRules++;
          continue;
        }
        let targets: Element[];
        try {
          targets = Array.from(doc.querySelectorAll(sel));
        } catch {
          report.unsupportedCssRules++;
          continue;
        }
        const spec = specificity(sel);
        for (const d of decls) {
          const ok = allowDeclaration(d.prop, d.value);
          if (!ok) {
            report.droppedDeclarations++;
            continue;
          }
          for (const el of targets) offer(el, ok.prop, ok.value, d.important, spec);
        }
      }
    }
  }

  // Inline style attributes win over sheet rules unless the rule is !important.
  doc.querySelectorAll('[style]').forEach((el) => {
    for (const d of parseDeclarations(el.getAttribute('style') ?? '')) {
      const ok = allowDeclaration(d.prop, d.value);
      if (!ok) {
        report.droppedDeclarations++;
        continue;
      }
      offer(el, ok.prop, ok.value, d.important, [1000, 0, 0]);
    }
  });
  for (const [el, props] of computed) {
    const style = [...props].map(([p, w]) => `${p}: ${w.value}`).join('; ');
    if (style) {
      el.setAttribute('style', style);
      report.stylesApplied++;
    } else el.removeAttribute('style');
  }
  doc.querySelectorAll('[style]').forEach((el) => {
    if (!computed.has(el)) el.removeAttribute('style');
  });

  /* 3. images → uploaded copies */
  const uploaded = new Map<string, string>();
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = (img.getAttribute('src') ?? '').trim();
    let blob: Blob | null = null;
    let key = src;
    let name = 'image';
    if (/^data:/i.test(src)) {
      blob = dataUriToBlob(src);
      key = src.slice(0, 200) + src.length;
    } else if (!src || isExternal(src)) {
      report.externalImages++;
      img.remove();
      continue;
    } else {
      const file = resolve(src);
      if (!file || !IMAGE_RE.test(file.path)) {
        report.missingImages++;
        img.remove();
        continue;
      }
      blob = file.data;
      key = file.path;
      name = file.path.split('/').pop()!;
    }
    if (!blob) {
      report.failedImages++;
      img.remove();
      continue;
    }
    let url = uploaded.get(key);
    if (!url) {
      try {
        // zip entries carry no MIME type; derive it so the uploader can still downscale large photos
        const type = blob.type || MIME[name.split('.').pop()!.toLowerCase()] || '';
        url = (await deps.upload(new File([blob], name, { type }))).url;
        uploaded.set(key, url);
        report.imagesUploaded++;
      } catch {
        report.failedImages++;
        img.remove();
        continue;
      }
    }
    for (const a of Array.from(img.attributes)) if (!['alt', 'width', 'height', 'style'].includes(a.name)) img.removeAttribute(a.name);
    img.setAttribute('src', url);
  }

  /* 4. body content (body styles carried over on a wrapper) */
  const body = doc.body;
  const bodyStyle = body.getAttribute('style');
  const inner = body.innerHTML.trim();
  const raw = bodyStyle ? `<div style="${bodyStyle.replace(/"/g, '&quot;')}">${inner}</div>` : inner;
  const html = deps.sanitize(raw).replace(/\n{3,}/g, '\n\n').trim();
  report.length = html.length;
  report.tooLong = html.length > HTML_BODY_MAX;
  return { html, report };
}

/** Human-readable list of what was removed (empty when nothing was). */
export function describeDrops(r: ImportReport): string[] {
  const out: string[] = [];
  if (r.scripts) out.push(`스크립트 ${r.scripts}개`);
  if (r.eventHandlers) out.push(`이벤트 속성(onclick 등) ${r.eventHandlers}개`);
  if (r.embeds) out.push(`iframe·폼·동영상 등 ${r.embeds}개`);
  if (r.externalImages) out.push(`외부 이미지 ${r.externalImages}개`);
  if (r.missingImages) out.push(`묶음에 없는 이미지 ${r.missingImages}개`);
  if (r.failedImages) out.push(`올리지 못한 이미지 ${r.failedImages}개`);
  if (r.externalStylesheets) out.push(`외부 CSS 파일 ${r.externalStylesheets}개`);
  if (r.unsupportedCssRules) out.push(`옮길 수 없는 CSS 규칙(@media, :hover 등) ${r.unsupportedCssRules}개`);
  if (r.droppedDeclarations) out.push(`허용되지 않는 CSS 속성 ${r.droppedDeclarations}개`);
  return out;
}
