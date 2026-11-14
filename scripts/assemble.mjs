// Copies the built web app into dist/public and pre-compresses text assets (served with preCompressed).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDist = path.join(root, 'apps/web/dist');
const pub = path.join(root, 'dist/public');

if (!fs.existsSync(path.join(webDist, 'index.html'))) {
  console.error('apps/web/dist 가 없습니다. 먼저 웹을 빌드하세요.');
  process.exit(1);
}

fs.rmSync(pub, { recursive: true, force: true });
fs.cpSync(webDist, pub, { recursive: true });

const compressible = /\.(js|css|html|svg|json|txt|map)$/;
let count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (compressible.test(entry.name) && !entry.name.endsWith('.map')) {
      const buf = fs.readFileSync(p);
      if (buf.length < 1024) continue;
      fs.writeFileSync(`${p}.br`, zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
      fs.writeFileSync(`${p}.gz`, zlib.gzipSync(buf, { level: 9 }));
      count++;
    }
  }
}
walk(pub);

fs.writeFileSync(path.join(root, 'dist/package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');
console.log(`web assets → dist/public (${count} files pre-compressed)`);
