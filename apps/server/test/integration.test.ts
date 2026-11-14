import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc, type Socket } from 'socket.io-client';
import type { AdminSnapshot, PlaySnapshot, Result, RevealPayload, YouResult } from '@sq/shared';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig } from '../src/config';
import { sanitizeQuestionHtml } from '../src/security/sanitize';

let app: BuiltApp;
let base: string;
let cookie = '';
let dir: string;

async function api<T>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'speed-quiz',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0]!;
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

function waitFor<T>(socket: Socket, event: string, pred: (p: T) => boolean = () => true, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const h = (p: T) => {
      if (!pred(p)) return;
      clearTimeout(t);
      socket.off(event, h);
      resolve(p);
    };
    socket.on(event, h);
  });
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-int-'));
  const config = loadConfig({
    appRoot: dir,
    dataDir: dir,
    port: 0,
    host: '127.0.0.1',
    adminInitialUsername: 'admin',
    adminInitialPassword: 'password123',
    publicBaseUrl: 'http://quiz.test',
    logLevel: 'error',
  });
  app = await buildApp(config, { logger: false });
  await app.fastify.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.fastify.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('HTTP + realtime integration', () => {
  it('rejects bad logins and requires auth + CSRF header', async () => {
    expect((await api('POST', '/api/auth/login', { username: 'admin', password: 'nope' })).status).toBe(401);
    expect((await api('GET', '/api/admin/questions')).status).toBe(401);
    const login = await api<{ username: string }>('POST', '/api/auth/login', { username: 'admin', password: 'password123' });
    expect(login.status).toBe(200);
    expect(cookie).toMatch(/^sq_admin=/);
    const noCsrf = await fetch(base + '/api/admin/questions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{}',
    });
    expect(noCsrf.status).toBe(403);
  });

  it('sanitizes HTML questions', () => {
    const dirty =
      '<p style="color:red;position:fixed" onclick="x()">안녕<script>alert(1)</script></p><img src="https://evil/x.png" onerror="x"><a href="javascript:x">링크</a><svg><circle/></svg><iframe src="x"></iframe>';
    const clean = sanitizeQuestionHtml(dirty);
    expect(clean).toBe('<p style="color:red">안녕</p>링크');
    expect(sanitizeQuestionHtml('<img src="/uploads/0123456789abcdef0123456789abcdef.png" width="10" height="abc">')).toBe(
      '<img src="/uploads/0123456789abcdef0123456789abcdef.png" width="10" />',
    );
  });

  it('plays a full game over sockets with 30 participants', async () => {
    const qIds: number[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await api<{ id: number }>('POST', '/api/admin/questions', {
        kind: i === 0 ? 'HTML' : 'TEXT',
        body: i === 0 ? '<p><b>굵게</b> 질문</p><script>x</script>' : '텍스트 질문',
        timeLimitSec: 5,
        choices: [
          { text: 'A', isCorrect: i === 0 },
          { text: 'B', isCorrect: i === 1 },
          { text: 'C', isCorrect: false },
        ],
      });
      expect(r.status).toBe(200);
      qIds.push(r.data.id);
    }
    const q0 = await api<{ body: string }>('GET', `/api/admin/questions/${qIds[0]}`);
    expect(q0.data.body).toBe('<p><b>굵게</b> 질문</p>');

    const room = await api<{ id: number }>('POST', '/api/admin/rooms', {
      title: '통합 테스트',
      settings: { readyCountdownSec: 0, prizeCount: 3 },
      items: qIds.map((questionId) => ({ questionId })),
    });
    expect(room.status).toBe(200);
    const confirm = await api<{ code: string; joinUrl: string }>('POST', `/api/admin/rooms/${room.data.id}/confirm`);
    expect(confirm.data.joinUrl).toBe(`http://quiz.test/join/${confirm.data.code}`);
    expect((await api('PUT', `/api/admin/rooms/${room.data.id}`, { title: 'x', settings: {}, items: [] })).status).toBe(409);

    const info = await api<{ joinable: boolean }>('GET', `/api/public/rooms/${confirm.data.code}`);
    expect(info.data.joinable).toBe(true);

    // Admin socket requires the cookie
    const anon = ioc(`${base}/admin`, { transports: ['websocket'], forceNew: true });
    const anonErr = await new Promise<string>((r) => anon.on('connect_error', (e) => r(e.message)));
    expect(anonErr).toBe('UNAUTHORIZED');
    anon.close();

    const admin = ioc(`${base}/admin`, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true });
    const watch = await admin.timeout(5000).emitWithAck('room:watch', { roomId: room.data.id }) as Result<AdminSnapshot>;
    expect(watch.ok).toBe(true);

    const N = 30;
    const players: { pid: number; socket: Socket; snap: PlaySnapshot }[] = [];
    for (let i = 0; i < N; i++) {
      const j = await api<{ participantId: number; token: string }>('POST', `/api/public/rooms/${confirm.data.code}/join`, {
        nickname: `참가자${i}`,
      });
      expect(j.status).toBe(200);
      const socket = ioc(`${base}/play`, { transports: ['websocket'], auth: { token: j.data.token }, forceNew: true });
      const snap = await waitFor<PlaySnapshot>(socket, 'state:sync');
      players.push({ pid: j.data.participantId, socket, snap });
    }
    expect((await api('POST', `/api/public/rooms/${confirm.data.code}/join`, { nickname: '참가자0' })).status).toBe(409);
    expect(players[N - 1]!.snap.rosterCount).toBe(N);

    const screen = ioc(`${base}/screen`, { transports: ['websocket'], auth: { roomId: room.data.id, key: 'wrong' }, forceNew: true });
    const screenErr = await new Promise<string>((r) => screen.on('connect_error', (e) => r(e.message)));
    expect(screenErr).toBe('UNAUTHORIZED');
    screen.close();

    // Question 1
    const starts = players.map((p) => waitFor<{ question: { roomQuestionId: number; choices: { id: number }[] } }>(p.socket, 'question:start'));
    const ack1 = (await admin.timeout(5000).emitWithAck('control', { roomId: room.data.id, type: 'START_QUESTION', index: 0 })) as Result<AdminSnapshot>;
    expect(ack1.ok).toBe(true);
    const start = await starts[0]!;
    await Promise.all(starts);
    expect(JSON.stringify(start)).not.toMatch(/isCorrect/);
    const [correctId, wrongId] = [start.question.choices[0]!.id, start.question.choices[1]!.id];
    const reveals = players.map((p) => waitFor<RevealPayload>(p.socket, 'question:reveal'));
    const results = players.map((p) => waitFor<YouResult>(p.socket, 'you:result'));
    // first 10 answer correctly in order, the rest wrong
    for (let i = 0; i < N; i++) {
      const r = (await players[i]!.socket.timeout(5000).emitWithAck('answer:submit', {
        roomQuestionId: start.question.roomQuestionId,
        choiceId: i < 10 ? correctId : wrongId,
      })) as Result<unknown>;
      expect(r.ok).toBe(true);
    }
    const reveal = await reveals[0]!;
    expect(reveal.closeReason).toBe('ALL_ANSWERED');
    expect(reveal.correctCount).toBe(10);
    const yous = await Promise.all(results);
    expect(yous[0]).toMatchObject({ correct: true, points: 1000, correctRank: 1, rank: 1 });
    expect(yous[9]).toMatchObject({ correct: true, points: 550, correctRank: 10, rank: 10 });
    expect(yous[20]).toMatchObject({ correct: false, points: 0 });

    // Reconnect keeps identity; resubmitting after close is refused
    const late = (await players[0]!.socket.timeout(5000).emitWithAck('answer:submit', {
      roomQuestionId: start.question.roomQuestionId,
      choiceId: correctId,
    })) as Result<unknown>;
    expect(late.ok).toBe(false);

    // Question 2 → timer close, then finish + ceremony
    await admin.timeout(5000).emitWithAck('control', { roomId: room.data.id, type: 'START_QUESTION', index: 1 });
    const reveal2 = await waitFor<RevealPayload>(players[0]!.socket, 'question:reveal', () => true, 9000);
    expect(reveal2.closeReason).toBe('TIMER');
    const fin = (await admin.timeout(5000).emitWithAck('control', { roomId: room.data.id, type: 'FINISH' })) as Result<AdminSnapshot>;
    expect(fin.ok && fin.data.winners.map((w) => w.nickname)).toEqual(['참가자0', '참가자1', '참가자2']);
    for (const rank of [3, 2, 1]) {
      const r = (await admin.timeout(5000).emitWithAck('control', { roomId: room.data.id, type: 'REVEAL_PRIZE', rank })) as Result<AdminSnapshot>;
      expect(r.ok).toBe(true);
    }
    const finals = waitFor<{ rank: number; isWinner: boolean }>(players[0]!.socket, 'you:final');
    await admin.timeout(5000).emitWithAck('control', { roomId: room.data.id, type: 'END' });
    expect(await finals).toMatchObject({ rank: 1, isWinner: true });

    const csv = await fetch(`${base}/api/admin/rooms/${room.data.id}/results.csv`, { headers: { cookie } });
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('참가자0');

    for (const p of players) p.socket.close();
    admin.close();
  }, 30_000);
});
