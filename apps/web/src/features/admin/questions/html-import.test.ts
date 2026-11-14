// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { zipSync, strToU8 } from 'fflate';
import { sanitizeHtml } from '@/lib/sanitize';
import { describeDrops, filesFromSelection, importHtmlBundle, normalizePath, specificity, type BundleFile } from './html-import';

// jsdom's Blob has no arrayBuffer(); browsers (and Node) do.
Object.assign(globalThis, { Blob: NodeBlob, File: NodeFile });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const file = (path: string, content: string | Uint8Array): BundleFile => ({ path, data: new Blob([content as BlobPart]) });

function deps() {
  let n = 0;
  const upload = vi.fn(async () => ({ url: `/uploads/${String(++n).padStart(32, 'a')}.png` }));
  return { upload, sanitize: sanitizeHtml };
}

const INDEX = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="https://cdn.example.com/x.css">
<style>
  .q { color: #c00; position: fixed; z-index: 99 }
  td { border: 1px solid #999; padding: 4px 8px }
  #big { font-size: 2em }
  a:hover { color: blue }
  @media (max-width: 600px) { .q { color: green } }
</style>
<script>alert(1)</script></head>
<body>
  <h1 class="q" onclick="steal()">제목</h1>
  <p id="big" class="q" style="color: #00c">본문</p>
  <table><tr><td>셀</td></tr></table>
  <img src="img/a.png" alt="그림" onerror="x()">
  <img src="./img/a.png">
  <img src="https://evil.example/t.png">
  <img src="img/missing.png">
  <iframe src="https://evil.example"></iframe>
  <form action="https://evil.example"><input name="pw"></form>
</body></html>`;

describe('html bundle import', () => {
  it('inlines allowed CSS, uploads bundled images once and strips the rest', async () => {
    const d = deps();
    const { html, report } = await importHtmlBundle(
      [file('quiz/index.html', INDEX), file('quiz/css/style.css', 'h1 { text-align: center; display: flex }'), file('quiz/img/a.png', PNG)],
      d,
    );
    expect(report.entry).toBe('quiz/index.html');
    expect(html).not.toMatch(/script|onclick|onerror|iframe|form|evil|position|z-index|display/i);
    // linked sheet comes first in document order, then the <style> block
    expect(html).toContain('<h1 style="text-align: center; color: #c00">제목</h1>');
    // inline style beats the class rule; id rule adds font-size
    expect(html).toMatch(/<p style="[^"]*color: #00c[^"]*">본문<\/p>/);
    expect(html).toMatch(/font-size: 2em/);
    expect(html).toMatch(/<td style="border: 1px solid #999; padding: 4px 8px">셀<\/td>/);
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(report).toMatchObject({
      scripts: 1,
      embeds: 3, // iframe, form, input (input removed before its form)
      externalImages: 1,
      missingImages: 1,
      externalStylesheets: 1,
      imagesUploaded: 1,
      tooLong: false,
    });
    expect(report.eventHandlers).toBeGreaterThanOrEqual(2);
    expect(report.unsupportedCssRules).toBeGreaterThanOrEqual(2); // a:hover, @media
    expect(report.droppedDeclarations).toBeGreaterThanOrEqual(3); // position, z-index, display
    expect(describeDrops(report).join(' ')).toContain('스크립트 1개');
  });

  it('reads zips and folder paths, and prefers the shallowest index.html', async () => {
    const zip = zipSync({
      'pack/index.html': strToU8('<p>zip <img src="a.png"></p>'),
      'pack/a.png': PNG,
      'pack/sub/index.html': strToU8('<p>nested</p>'),
      '__MACOSX/pack/._a.png': strToU8('junk'),
      'pack/run.js': strToU8('alert(1)'),
    });
    const files = await filesFromSelection([new File([zip as BlobPart], 'q.zip')]);
    expect(files.map((f) => f.path).sort()).toEqual(['pack/a.png', 'pack/index.html', 'pack/sub/index.html']);
    const { html } = await importHtmlBundle(files, deps());
    expect(html).toMatch(/^<p>zip <img src="\/uploads\/a+1\.png"><\/p>$/);
  });

  it('turns data: images into uploads and wraps body styles', async () => {
    const b64 = btoa(String.fromCharCode(...PNG));
    const d = deps();
    const { html } = await importHtmlBundle(
      [file('one.html', `<body style="background: #fffbe6; text-align: center"><img src="data:image/png;base64,${b64}"></body>`)],
      d,
    );
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(html).toBe('<div style="background-color: #fffbe6; text-align: center"><img src="/uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1.png"></div>');
  });

  it('rejects bundles without html', async () => {
    await expect(importHtmlBundle([file('a.css', 'p{}')], deps())).rejects.toThrow(/HTML/);
  });

  it('helpers', () => {
    expect(normalizePath('./a\\b/../c//d.png')).toBe('a/c/d.png');
    expect(specificity('#a .b td')).toEqual([1, 1, 1]);
    expect(specificity('ul li:first-child')).toEqual([0, 1, 2]);
  });
});
