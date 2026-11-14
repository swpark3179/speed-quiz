import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Server } from 'socket.io';
import { AppError, errorMessage } from '@sq/shared';
import type { Config } from './config';
import { Db } from './db/driver';
import { migrate } from './db/migrations';
import { SessionStore } from './auth/sessions';
import { registerAuth } from './auth/plugin';
import { hashPassword, randomPassword } from './auth/password';
import { adminsRepo } from './db/repos/admins';
import { RoomRegistry } from './game/registry';
import { nullBus, realClock, realScheduler, type Clock, type Scheduler } from './game/runtime';
import { QuestionService } from './services/question-service';
import { RoomService } from './services/room-service';
import { ResultsService } from './services/results-service';
import { createRealtime } from './realtime/io';
import { authRoutes } from './http/routes/auth';
import { questionRoutes } from './http/routes/questions';
import { roomRoutes } from './http/routes/rooms';
import { publicRoutes } from './http/routes/public';
import type { AppContext } from './context';

export interface BuiltApp {
  fastify: FastifyInstance;
  io: Server;
  ctx: AppContext;
  close(): Promise<void>;
}

export interface BuildOptions {
  clock?: Clock;
  scheduler?: Scheduler;
  logger?: boolean;
}

const BACKUP_KEEP = 14;

export async function buildApp(config: Config, opts: BuildOptions = {}): Promise<BuiltApp> {
  const db = new Db(config.dbPath);
  migrate(db);

  const fastify = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  const backup = (reason: string) => {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      db.backupTo(path.join(config.backupsDir, `speed-quiz-${stamp}-${reason}.db`));
      const files = fs
        .readdirSync(config.backupsDir)
        .filter((f) => f.endsWith('.db'))
        .sort();
      for (const f of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) fs.rmSync(path.join(config.backupsDir, f));
    } catch (err) {
      fastify.log.warn({ err }, 'backup failed');
    }
  };

  const registry = new RoomRegistry({
    db,
    clock: opts.clock ?? realClock,
    scheduler: opts.scheduler ?? realScheduler,
    bus: nullBus,
    graceMs: config.answerGraceMs,
    onEnded: () => setTimeout(() => backup('ended'), 1000).unref(),
  });
  const sessions = new SessionStore(db, config.sessionTtlMs);
  const ctx: AppContext = {
    config,
    db,
    sessions,
    registry,
    questions: new QuestionService(db),
    rooms: new RoomService(db, registry),
    results: new ResultsService(db),
    backup,
  };

  await seedAdmin(ctx, fastify);

  await fastify.register(cookie);
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        ...(config.cookieSecure ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    hsts: config.cookieSecure ? { maxAge: 15_552_000 } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: config.cookieSecure ? { policy: 'same-origin-allow-popups' } : false,
    originAgentCluster: false,
  });
  await fastify.register(rateLimit, { global: false });
  await fastify.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5 } });

  registerAuth(fastify, sessions);

  // Accept empty JSON bodies (e.g. POST /confirm) instead of failing with 400.
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (!text.trim()) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new AppError('BAD_REQUEST'), undefined);
    }
  });

  fastify.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) return reply.status(429).send({ code: 'RATE_LIMITED', message: errorMessage('RATE_LIMITED') });
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.statusCode === 413) {
      return reply.status(413).send({ code: 'UPLOAD_TOO_LARGE', message: errorMessage('UPLOAD_TOO_LARGE') });
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ code: 'BAD_REQUEST', message: errorMessage('BAD_REQUEST') });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ code: 'INTERNAL', message: errorMessage('INTERNAL') });
  });

  publicRoutes(fastify, ctx);
  authRoutes(fastify, ctx);
  questionRoutes(fastify, ctx);
  roomRoutes(fastify, ctx);

  await fastify.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
    index: false,
    immutable: true,
    maxAge: '365d',
    setHeaders: (res) => void res.header('X-Content-Type-Options', 'nosniff'),
  });

  const hasWeb = fs.existsSync(path.join(config.publicDir, 'index.html'));
  if (hasWeb) {
    await fastify.register(fastifyStatic, {
      root: config.publicDir,
      prefix: '/',
      index: false,
      wildcard: false,
      preCompressed: true,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) void res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else void res.header('Cache-Control', 'no-cache');
      },
    });
  }

  fastify.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0]!;
    const isApi = url.startsWith('/api/') || url.startsWith('/uploads/') || url.startsWith('/socket.io');
    if (req.method === 'GET' && !isApi && !/\.[a-z0-9]{2,5}$/i.test(url)) {
      if (hasWeb) return reply.header('Cache-Control', 'no-cache').type('text/html').sendFile('index.html', config.publicDir);
      return reply
        .type('text/html; charset=utf-8')
        .send('<!doctype html><meta charset="utf-8"><p>웹 화면이 아직 빌드되지 않았어요. <code>pnpm build</code>를 실행해 주세요.</p>');
    }
    return reply.status(404).send({ code: 'NOT_FOUND', message: errorMessage('NOT_FOUND') });
  });

  await fastify.ready();
  const { io, bus } = createRealtime(fastify.server, ctx);
  registry.setBus(bus);
  const recovered = registry.loadLive();
  if (recovered) fastify.log.info(`진행 중이던 퀴즈방 ${recovered}개를 복구했어요.`);
  registry.startSweeper();
  sessions.purgeExpired();
  const purge = setInterval(() => sessions.purgeExpired(), 3600_000);
  purge.unref();
  const dailyBackup = setInterval(() => backup('daily'), 24 * 3600_000);
  dailyBackup.unref();

  let closed = false;
  return {
    fastify,
    io,
    ctx,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(purge);
      clearInterval(dailyBackup);
      registry.disposeAll();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await fastify.close().catch(() => {});
      db.close();
    },
  };
}

async function seedAdmin(ctx: AppContext, fastify: FastifyInstance): Promise<void> {
  const { db, config } = ctx;
  if (adminsRepo.count(db) > 0) return;
  const username = config.adminInitialUsername ?? 'admin';
  const generated = !config.adminInitialPassword;
  const password = config.adminInitialPassword ?? randomPassword();
  adminsRepo.insert(db, { username, displayName: '관리자', passwordHash: await hashPassword(password), role: 'MAIN' });
  if (generated) {
    const msg = `최초 관리자 계정을 만들었어요. 아이디: ${username} / 비밀번호: ${password}  (로그인 후 바로 비밀번호를 변경하세요)`;
    fastify.log.warn(msg);
    console.log(`\n  ${msg}\n`);
  } else {
    fastify.log.warn(`최초 관리자 계정(${username})을 만들었어요. 로그인 후 비밀번호를 변경하세요.`);
  }
}
