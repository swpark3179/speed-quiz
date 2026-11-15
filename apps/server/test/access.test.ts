import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import type { AdminSnapshot, Result } from '@sq/shared';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig } from '../src/config';
import { renderReport, type ReportData } from '../src/services/report-html';

let app: BuiltApp;
let base: string;
let dir: string;

class Client {
  cookie = '';
  async api<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'speed-quiz', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0]!;
    const text = await res.text();
    return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
  }
  login(username: string, password: string) {
    return this.api('POST', '/api/auth/login', { username, password });
  }
}

const q = (over: Record<string, unknown> = {}) => ({
  kind: 'TEXT',
  body: '문제',
  timeLimitSec: 5,
  choices: [
    { text: 'A', isCorrect: true },
    { text: 'B', isCorrect: false },
  ],
  ...over,
});

const main = new Client();
const bob = new Client();

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-acc-'));
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
  expect((await main.login('admin', 'password123')).status).toBe(200);
  const created = await main.api('POST', '/api/admin/admins', { username: 'bob', displayName: '밥', password: 'bobpassword' });
  expect(created.status).toBe(200);
  expect(created.data.role).toBe('ADMIN');
  expect((await bob.login('bob', 'bobpassword')).status).toBe(200);
});

afterAll(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('roles', () => {
  it('first admin is MAIN; only MAIN can manage accounts', async () => {
    expect((await main.api('GET', '/api/auth/me')).data.role).toBe('MAIN');
    expect((await bob.api('GET', '/api/auth/me')).data.role).toBe('ADMIN');
    expect((await main.api('GET', '/api/admin/admins')).status).toBe(200);
    expect((await bob.api('GET', '/api/admin/admins')).status).toBe(403);
    expect((await bob.api('POST', '/api/admin/admins', { username: 'eve', displayName: 'e', password: 'evepassword' })).status).toBe(403);
    expect((await bob.api('PATCH', '/api/admin/admins/1', { disabled: true })).status).toBe(403);
  });

  it('lets any admin rename themselves', async () => {
    const r = await bob.api('PATCH', '/api/auth/me', { displayName: '밥아저씨' });
    expect(r.status).toBe(200);
    expect(r.data.displayName).toBe('밥아저씨');
    expect((await bob.api('PATCH', '/api/auth/me', { displayName: ' ' })).status).toBe(400);
  });
});

describe('isolation', () => {
  it('keeps rooms and private questions per admin', async () => {
    const priv = (await main.api('POST', '/api/admin/questions', q({ isPublic: false }))).data;
    const pub = (await main.api('POST', '/api/admin/questions', q({ isPublic: true, body: '공개 문제' }))).data;

    // question visibility over HTTP
    expect((await bob.api('GET', `/api/admin/questions/${priv.id}`)).status).toBe(404);
    const seen = (await bob.api('GET', '/api/admin/questions')).data.items.map((i: { id: number }) => i.id);
    expect(seen).toContain(pub.id);
    expect(seen).not.toContain(priv.id);
    expect((await bob.api('PUT', `/api/admin/questions/${pub.id}`, q())).status).toBe(403);
    expect((await bob.api('DELETE', `/api/admin/questions/${pub.id}`)).status).toBe(403);
    expect((await bob.api('POST', `/api/admin/questions/${pub.id}/duplicate`)).data).toMatchObject({ mine: true, isPublic: false });

    // main's room
    const room = (await main.api('POST', '/api/admin/rooms', { title: '메인 방', settings: {}, items: [{ questionId: priv.id }] })).data;
    expect((await main.api('GET', '/api/admin/rooms')).data.map((r: { id: number }) => r.id)).toContain(room.id);
    expect((await bob.api('GET', '/api/admin/rooms')).data).toEqual([]);
    for (const [method, url, body] of [
      ['GET', `/api/admin/rooms/${room.id}`],
      ['PUT', `/api/admin/rooms/${room.id}`, { title: 'x', settings: {}, items: [] }],
      ['DELETE', `/api/admin/rooms/${room.id}`],
      ['POST', `/api/admin/rooms/${room.id}/confirm`],
      ['POST', `/api/admin/rooms/${room.id}/clone`],
      ['GET', `/api/admin/rooms/${room.id}/results`],
      ['GET', `/api/admin/rooms/${room.id}/results.csv`],
      ['GET', `/api/admin/rooms/${room.id}/report.html`],
    ] as const) {
      expect((await bob.api(method, url, body)).status, `${method} ${url}`).toBe(404);
    }
    // bob cannot put main's private question into his own room
    expect((await bob.api('POST', '/api/admin/rooms', { title: 'b', settings: {}, items: [{ questionId: priv.id }] })).status).toBe(400);

    // report only after the quiz ended
    expect((await main.api('GET', `/api/admin/rooms/${room.id}/report.html`)).status).toBe(409);

    // sockets: bob cannot watch/control main's live room
    const confirm = (await main.api('POST', `/api/admin/rooms/${room.id}/confirm`)).data;
    expect(confirm.code).toMatch(/^\d{6}$/);
    const sock = ioc(`${base}/admin`, { transports: ['websocket'], extraHeaders: { cookie: bob.cookie }, forceNew: true });
    await new Promise<void>((res) => sock.on('connect', () => res()));
    const watch = (await sock.timeout(5000).emitWithAck('room:watch', { roomId: room.id })) as Result<AdminSnapshot>;
    expect(watch.ok).toBe(false);
    const ctl = (await sock.timeout(5000).emitWithAck('control', { roomId: room.id, type: 'START_QUESTION', index: 0 })) as Result<AdminSnapshot>;
    expect(ctl.ok).toBe(false);
    sock.close();

    // bob's admin cookie is not enough to open main's presenter screen
    const scr = ioc(`${base}/screen`, { transports: ['websocket'], auth: { roomId: room.id }, extraHeaders: { cookie: bob.cookie }, forceNew: true });
    expect(await new Promise<string>((res) => scr.on('connect_error', (e) => res(e.message)))).toBe('UNAUTHORIZED');
    scr.close();
  });
});

describe('report html', () => {
  it('escapes user-supplied text', () => {
    const evil = `<script>alert(1)</script>"'&`;
    const data: ReportData = {
      room: { title: evil, startedAt: 1_700_000_000_000, finishedAt: 1_700_000_600_000, prizeCount: 1 },
      generatedAt: 1_700_000_700_000,
      participantCount: 2,
      questionCount: 1,
      avgCorrectRate: 0.5,
      avgCorrectMs: 1500,
      ranking: [
        { rank: 1, nickname: evil, score: 1000, correctCount: 1, avgCorrectMs: 1500, isWinner: true },
        { rank: 2, nickname: '<img src=x onerror=alert(1)>', score: 0, correctCount: 0, avgCorrectMs: null, isWinner: false },
      ],
      questions: [
        {
          index: 0,
          title: evil,
          text: '<b>본문</b>',
          kind: 'HTML',
          participantCount: 2,
          answeredCount: 2,
          correctCount: 1,
          avgElapsedMs: 2000,
          fastest: { nickname: evil, elapsedMs: 1500 },
          choices: [
            { position: 0, text: evil, isCorrect: true, count: 1 },
            { position: 1, text: 'B', isCorrect: false, count: 1 },
          ],
        },
      ],
    };
    const html = renderReport(data);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>본문</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect((html.match(/<script/gi) ?? []).length).toBe(0);
  });

  it('renders with no participants', () => {
    const html = renderReport({
      room: { title: '빈 방', startedAt: null, finishedAt: null, prizeCount: 3 },
      generatedAt: Date.now(),
      participantCount: 0,
      questionCount: 0,
      avgCorrectRate: 0,
      avgCorrectMs: null,
      ranking: [],
      questions: [],
    });
    expect(html).toContain('빈 방');
  });
});

describe('question groups over HTTP', () => {
  it('lists, moves and protects groups per admin', async () => {
    const g = await main.api('POST', '/api/admin/question-groups', { name: '메인 그룹' });
    expect(g.status).toBe(200);
    expect((await main.api('POST', '/api/admin/question-groups', { name: '메인 그룹' })).status).toBe(409);
    expect((await main.api('POST', '/api/admin/question-groups', { name: '  ' })).status).toBe(400);

    const a = (await main.api('POST', '/api/admin/questions', q({ isPublic: true, body: '그룹 문제 A' }))).data;
    const b = (await main.api('POST', '/api/admin/questions', q({ isPublic: false, body: '그룹 문제 B' }))).data;
    const moved = await main.api('POST', '/api/admin/questions/move', { questionIds: [b.id, a.id], groupId: g.data.id });
    expect(moved.data).toEqual({ moved: 2 });

    const inGroup = (await main.api('GET', `/api/admin/questions?groupId=${g.data.id}`)).data.items.map((i: { id: number }) => i.id);
    expect(inGroup).toEqual([b.id, a.id]);
    const ungrouped = (await main.api('GET', '/api/admin/questions?ungrouped=1&pageSize=200')).data.items.map((i: { id: number }) => i.id);
    expect(ungrouped).not.toContain(a.id);
    expect((await main.api('GET', '/api/admin/questions?ungrouped=0&pageSize=200')).data.items.map((i: { id: number }) => i.id)).toContain(a.id);

    const mainGroups = (await main.api('GET', '/api/admin/question-groups')).data.items;
    expect(mainGroups.find((x: { id: number }) => x.id === g.data.id)).toMatchObject({ questionCount: 2, publicCount: 1, mine: true });
    const bobGroups = (await bob.api('GET', '/api/admin/question-groups')).data.items;
    expect(bobGroups.find((x: { id: number }) => x.id === g.data.id)).toMatchObject({ questionCount: 1, mine: false });
    expect((await bob.api('GET', `/api/admin/questions?groupId=${g.data.id}`)).data.items.map((i: { id: number }) => i.id)).toEqual([a.id]);

    for (const [method, url, body] of [
      ['PATCH', `/api/admin/question-groups/${g.data.id}`, { name: 'x' }],
      ['DELETE', `/api/admin/question-groups/${g.data.id}`],
      ['PUT', `/api/admin/question-groups/${g.data.id}/order`, { questionIds: [a.id] }],
      ['POST', `/api/admin/question-groups/${g.data.id}/visibility`, { isPublic: true }],
      ['POST', '/api/admin/questions/move', { questionIds: [a.id], groupId: null }],
    ] as const) {
      expect((await bob.api(method, url, body)).status, `${method} ${url}`).toBe(403);
    }

    expect((await main.api('PUT', `/api/admin/question-groups/${g.data.id}/order`, { questionIds: [a.id, b.id] })).status).toBe(200);
    expect((await main.api('PUT', `/api/admin/question-groups/${g.data.id}/order`, { questionIds: [a.id] })).status).toBe(409);
    expect((await main.api('POST', `/api/admin/question-groups/${g.data.id}/visibility`, { isPublic: true })).data).toEqual({ changed: 1 });
    expect((await main.api('DELETE', `/api/admin/question-groups/${g.data.id}?withQuestions=1`)).data).toEqual({ ok: true, deletedQuestions: 2 });
    expect((await main.api('GET', `/api/admin/questions/${a.id}`)).status).toBe(404);
  });
});
