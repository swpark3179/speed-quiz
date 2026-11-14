/**
 * Load test: N socket participants answer M questions with random delays.
 * Usage: pnpm loadtest -- --url http://localhost:3000 --user admin --password <pw> [--n 300] [--q 5]
 * Reports ack latency percentiles and reveal fan-out time.
 */
import { createRequire } from 'node:module';
import type { Socket } from 'socket.io-client';

// Load the CommonJS (Node) build explicitly so `extraHeaders` (admin cookie) is honoured.
const { io } = createRequire(import.meta.url)('socket.io-client') as typeof import('socket.io-client');

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (def === undefined) throw new Error(`--${name} is required`);
  return def;
}

const URL = arg('url', 'http://localhost:3000');
const N = Number(arg('n', '300'));
const Q = Number(arg('q', '5'));
let cookie = '';

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(URL + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'speed-quiz', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0]!;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

async function main() {
  await api('POST', '/api/auth/login', { username: arg('user', 'admin'), password: arg('password') });
  const ids: number[] = [];
  for (let i = 0; i < Q; i++) {
    const q = await api<{ id: number }>('POST', '/api/admin/questions', {
      kind: 'TEXT',
      body: `부하 테스트 문제 ${i + 1}`,
      timeLimitSec: 10,
      choices: [1, 2, 3, 4].map((n) => ({ text: `보기 ${n}`, isCorrect: n === 1 })),
    });
    ids.push(q.id);
  }
  const room = await api<{ id: number }>('POST', '/api/admin/rooms', {
    title: `부하 테스트 ${new Date().toISOString()}`,
    settings: { readyCountdownSec: 1, maxParticipants: 1000 },
    items: ids.map((questionId) => ({ questionId })),
  });
  const { code } = await api<{ code: string }>('POST', `/api/admin/rooms/${room.id}/confirm`);

  console.log(`joining ${N} participants…`);
  const players: { s: Socket; start: { question: { roomQuestionId: number; choices: { id: number }[] }; timing: { opensAt: number } } | null }[] = [];
  const revealTimes: number[] = [];
  for (let i = 0; i < N; i++) {
    const j = await api<{ token: string }>('POST', `/api/public/rooms/${code}/join`, { nickname: `봇${i}` });
    const s = io(`${URL}/play`, { transports: ['websocket'], auth: { token: j.token }, forceNew: true });
    const p = { s, start: null as (typeof players)[number]['start'] };
    s.on('question:start', (payload) => (p.start = payload));
    s.on('question:reveal', () => revealTimes.push(Date.now()));
    players.push(p);
  }
  await Promise.all(players.map((p) => new Promise<void>((r) => (p.s.connected ? r() : p.s.once('connect', () => r())))));

  const admin = io(`${URL}/admin`, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true });
  await new Promise<void>((resolve, reject) => {
    admin.once('connect', () => resolve());
    admin.once('connect_error', (e) => reject(new Error(`admin socket: ${e.message}`)));
  });
  await admin.timeout(5000).emitWithAck('room:watch', { roomId: room.id });

  const acks: number[] = [];
  for (let qi = 0; qi < Q; qi++) {
    revealTimes.length = 0;
    await admin.timeout(5000).emitWithAck('control', { roomId: room.id, type: 'START_QUESTION', index: qi });
    await new Promise((r) => setTimeout(r, 1200));
    await Promise.all(
      players.map(async (p) => {
        await new Promise((r) => setTimeout(r, Math.random() * 3000));
        const q = p.start!.question;
        const choice = q.choices[Math.floor(Math.random() * q.choices.length)]!.id;
        const t0 = performance.now();
        await p.s.timeout(10_000).emitWithAck('answer:submit', { roomQuestionId: q.roomQuestionId, choiceId: choice });
        acks.push(performance.now() - t0);
      }),
    );
    await new Promise((r) => setTimeout(r, 1000));
    const fanout = revealTimes.length ? Math.max(...revealTimes) - Math.min(...revealTimes) : NaN;
    console.log(`Q${qi + 1}: reveals received ${revealTimes.length}/${N}, fan-out spread ${fanout}ms`);
    await admin.timeout(5000).emitWithAck('control', { roomId: room.id, type: 'SHOW_LEADERBOARD', index: qi });
  }
  console.log(`answer ack latency: p50 ${pct(acks, 50).toFixed(1)}ms, p95 ${pct(acks, 95).toFixed(1)}ms, max ${Math.max(...acks).toFixed(1)}ms`);
  await admin.timeout(5000).emitWithAck('control', { roomId: room.id, type: 'ABORT' });
  admin.close();
  for (const p of players) p.s.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
