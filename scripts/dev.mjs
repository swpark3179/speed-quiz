// Runs the API server (tsx watch, :3000) and the Vite dev server (:5173) together. Works on Windows too.
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const env = { ...process.env, NODE_ENV: 'development' };

const procs = [
  spawn(pnpm, ['--filter', '@sq/server', 'dev'], { stdio: 'inherit', env, shell: isWin }),
  spawn(pnpm, ['--filter', '@sq/web', 'dev'], { stdio: 'inherit', env, shell: isWin }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
