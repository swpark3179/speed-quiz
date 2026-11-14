// Starts dist/server.js with a throwaway data dir and checks /api/health and the SPA (used by CI on Linux + Windows).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-smoke-'));
const port = 3900 + Math.floor(Math.random() * 90);

const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'dist/server.js')], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ADMIN_INITIAL_PASSWORD: 'smoke-test-pw', LOG_LEVEL: 'warn' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}\n${output}`);
  child.kill();
  process.exit(1);
};

const deadline = Date.now() + 20_000;
for (;;) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (res.ok) break;
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) fail('server did not become healthy');
  await new Promise((r) => setTimeout(r, 300));
}

const html = await (await fetch(`http://127.0.0.1:${port}/join`)).text();
if (!html.includes('<div id="root">')) fail('SPA index.html not served');
const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-requested-with': 'speed-quiz' },
  body: JSON.stringify({ username: 'admin', password: 'smoke-test-pw' }),
});
if (!login.ok) fail(`admin login failed: ${login.status}`);

child.kill();
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`SMOKE OK (${process.platform}, node ${process.version})`);
process.exit(0);
