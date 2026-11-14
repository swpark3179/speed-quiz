import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';

interface Running {
  app: BuiltApp;
  base: string;
  dir: string;
}

async function start(overrides: Partial<Config> = {}): Promise<Running> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-accounts-'));
  const config = loadConfig({
    appRoot: dir,
    dataDir: dir,
    port: 0,
    host: '127.0.0.1',
    adminInitialUsername: 'admin',
    adminInitialPassword: 'password123',
    publicBaseUrl: 'http://quiz.test',
    logLevel: 'error',
    ...overrides,
  });
  const app = await buildApp(config, { logger: false });
  await app.fastify.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.fastify.server.address();
  return { app, dir, base: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` };
}

async function stop(r: Running): Promise<void> {
  await r.app.close();
  fs.rmSync(r.dir, { recursive: true, force: true });
}

class Client {
  cookie = '';
  constructor(private readonly base: () => string) {}
  async api<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(this.base() + url, {
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
  body: '비밀 문제 본문',
  title: '비밀 제목',
  timeLimitSec: 5,
  choices: [
    { text: 'A', isCorrect: true },
    { text: 'B', isCorrect: false },
  ],
  ...over,
});

let srv: Running;
const main = new Client(() => srv.base);

beforeAll(async () => {
  srv = await start();
  expect((await main.login('admin', 'password123')).status).toBe(200);
});

afterAll(async () => {
  await stop(srv);
});

describe('self sign-up', () => {
  it('auto-approves a regular admin and signs them in', async () => {
    const carol = new Client(() => srv.base);
    expect((await carol.api('GET', '/api/auth/signup')).data).toEqual({ enabled: true });
    const r = await carol.api('POST', '/api/auth/signup', {
      username: 'carol',
      displayName: '캐롤',
      password: 'carolpassword',
      acknowledge: true,
    });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ username: 'carol', displayName: '캐롤', role: 'ADMIN', disabled: false });
    expect(carol.cookie).not.toBe('');
    expect((await carol.api('GET', '/api/auth/me')).data.username).toBe('carol');
    expect((await carol.api('GET', '/api/admin/admins')).status).toBe(403);
  });

  it('rejects taken ids/nicknames (case-insensitive) and a missing acknowledgement', async () => {
    const x = new Client(() => srv.base);
    const dupId = await x.api('POST', '/api/auth/signup', { username: 'CAROL', displayName: '새닉', password: 'password99', acknowledge: true });
    expect(dupId.status).toBe(409);
    expect(dupId.data.code).toBe('USERNAME_TAKEN');
    const dupNick = await x.api('POST', '/api/auth/signup', { username: 'dave', displayName: '관리자', password: 'password99', acknowledge: true });
    expect(dupNick.status).toBe(409);
    expect(dupNick.data.code).toBe('DISPLAY_NAME_TAKEN');
    const noAck = await x.api('POST', '/api/auth/signup', { username: 'dave', displayName: '데이브', password: 'password99' });
    expect(noAck.status).toBe(400);
    expect(x.cookie).toBe('');
  });

  it('applies nickname uniqueness to renames and main-created accounts too', async () => {
    const carol = new Client(() => srv.base);
    await carol.login('carol', 'carolpassword');
    expect((await carol.api('PATCH', '/api/auth/me', { displayName: '관리자' })).data.code).toBe('DISPLAY_NAME_TAKEN');
    expect((await carol.api('PATCH', '/api/auth/me', { displayName: '캐롤' })).status).toBe(200); // own name is fine
    const created = await main.api('POST', '/api/admin/admins', { username: 'erin', displayName: '캐롤', password: 'erinpassword' });
    expect(created.data.code).toBe('DISPLAY_NAME_TAKEN');
  });

  it('can be turned off with SIGNUP_ENABLED=false', async () => {
    const off = await start({ signupEnabled: false });
    try {
      const c = new Client(() => off.base);
      expect((await c.api('GET', '/api/auth/signup')).data).toEqual({ enabled: false });
      const r = await c.api('POST', '/api/auth/signup', { username: 'zed', displayName: '제드', password: 'zedpassword', acknowledge: true });
      expect(r.status).toBe(403);
      expect(r.data.code).toBe('SIGNUP_DISABLED');
    } finally {
      await stop(off);
    }
  });
});

describe('main role grant / revoke', () => {
  it('promotes and demotes other admins with immediate effect', async () => {
    const carol = new Client(() => srv.base);
    await carol.login('carol', 'carolpassword');
    const carolId = (await carol.api('GET', '/api/auth/me')).data.id as number;

    expect((await carol.api('PATCH', `/api/admin/admins/${carolId}`, { role: 'MAIN' })).status).toBe(403);

    const up = await main.api('PATCH', `/api/admin/admins/${carolId}`, { role: 'MAIN' });
    expect(up.status).toBe(200);
    expect(up.data.role).toBe('MAIN');
    // same session, new rights
    expect((await carol.api('GET', '/api/admin/admins')).status).toBe(200);
    expect((await carol.api('GET', '/api/admin/stats')).status).toBe(200);

    // a main cannot demote themselves
    const self = await carol.api('PATCH', `/api/admin/admins/${carolId}`, { role: 'ADMIN' });
    expect(self.status).toBe(400);
    expect(self.data.code).toBe('CANNOT_DEMOTE_SELF');

    // carol (main) can demote the original main, and back
    const mainId = (await main.api('GET', '/api/auth/me')).data.id as number;
    expect((await carol.api('PATCH', `/api/admin/admins/${mainId}`, { role: 'ADMIN' })).data.role).toBe('ADMIN');
    expect((await main.api('GET', '/api/admin/admins')).status).toBe(403);
    expect((await carol.api('PATCH', `/api/admin/admins/${mainId}`, { role: 'MAIN' })).data.role).toBe('MAIN');

    const down = await main.api('PATCH', `/api/admin/admins/${carolId}`, { role: 'ADMIN' });
    expect(down.data.role).toBe('ADMIN');
    expect((await carol.api('GET', '/api/admin/admins')).status).toBe(403);
  });
});

describe('usage stats', () => {
  it('is main-only and reports counts without any question/room content', async () => {
    const carol = new Client(() => srv.base);
    await carol.login('carol', 'carolpassword');
    expect((await carol.api('GET', '/api/admin/stats')).status).toBe(403);

    const qa = (await carol.api('POST', '/api/admin/questions', q())).data;
    await carol.api('POST', '/api/admin/questions', q({ isPublic: true }));
    await carol.api('POST', '/api/admin/rooms', { title: '캐롤의 비밀 방', settings: {}, items: [{ questionId: qa.id }] });

    const r = await main.api('GET', '/api/admin/stats?days=7&tz=540');
    expect(r.status).toBe(200);
    expect(r.data.days).toBe(7);
    expect(r.data.daily).toHaveLength(7);
    const row = r.data.perAdmin.find((a: { username: string }) => a.username === 'carol');
    expect(row).toMatchObject({ questions: 2, publicQuestions: 1, rooms: 1, gamesFinished: 0 });
    expect(r.data.totals).toMatchObject({ questions: 2, rooms: 1, roomsDraft: 1 });
    const today = r.data.daily.at(-1);
    expect(today).toMatchObject({ questions: 2, rooms: 1 });

    const json = JSON.stringify(r.data);
    expect(json).not.toContain('비밀');

    expect((await main.api('GET', '/api/admin/stats?days=5')).status).toBe(400);
  });
});
