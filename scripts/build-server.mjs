// Bundles the server into a single dist/server.js (no runtime node_modules needed).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'dist');
fs.mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'apps/server/src/main.ts')],
  outfile: path.join(outdir, 'server.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  legalComments: 'linked',
  external: ['node:sqlite', 'bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire as __sqCreateRequire } from 'node:module'; const require = __sqCreateRequire(import.meta.url);",
  },
  logLevel: 'info',
});

console.log('server bundle →', path.relative(root, path.join(outdir, 'server.js')));
