import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  appRoot: string;
  host: string;
  port: number;
  publicBaseUrl: string | null;
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  backupsDir: string;
  publicDir: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  sessionTtlMs: number;
  adminInitialUsername: string | null;
  adminInitialPassword: string | null;
  /** Allow self-service admin sign-up from the login screen (auto-approved). */
  signupEnabled: boolean;
  answerGraceMs: number;
  maxUploadBytes: number;
  logLevel: string;
  isDev: boolean;
}

/** <APP_ROOT>/dist/server.js in production; repo root when running from source. */
export function resolveAppRoot(): string {
  if (process.env.APP_ROOT) return path.resolve(process.env.APP_ROOT);
  const here = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(here) === 'dist') return path.dirname(here);
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(v: string | undefined, def: number): number {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const appRoot = overrides.appRoot ?? resolveAppRoot();
  const envFile = path.join(appRoot, '.env');
  if (!overrides.dataDir && fs.existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      /* ignore malformed .env */
    }
  }
  const env = process.env;
  const dataDir = overrides.dataDir ?? path.resolve(appRoot, env.DATA_DIR || './data');
  const distPublic = path.join(appRoot, 'dist', 'public');
  const webDist = path.join(appRoot, 'apps', 'web', 'dist');
  const cfg: Config = {
    appRoot,
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 3000),
    publicBaseUrl: env.PUBLIC_BASE_URL ? env.PUBLIC_BASE_URL.replace(/\/+$/, '') : null,
    dataDir,
    dbPath: path.join(dataDir, 'speed-quiz.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    backupsDir: path.join(dataDir, 'backups'),
    publicDir: fs.existsSync(distPublic) ? distPublic : webDist,
    cookieSecure: bool(env.COOKIE_SECURE, false),
    trustProxy: bool(env.TRUST_PROXY, false),
    sessionTtlMs: int(env.SESSION_TTL_HOURS, 12) * 3600_000,
    adminInitialUsername: env.ADMIN_INITIAL_USERNAME || null,
    adminInitialPassword: env.ADMIN_INITIAL_PASSWORD || null,
    signupEnabled: bool(env.SIGNUP_ENABLED, true),
    answerGraceMs: int(env.ANSWER_GRACE_MS, 300),
    maxUploadBytes: int(env.MAX_UPLOAD_MB, 5) * 1024 * 1024,
    logLevel: env.LOG_LEVEL || 'info',
    isDev: env.NODE_ENV === 'development',
    ...overrides,
  };
  if (overrides.dataDir) {
    cfg.dbPath = overrides.dbPath ?? path.join(cfg.dataDir, 'speed-quiz.db');
    cfg.uploadsDir = overrides.uploadsDir ?? path.join(cfg.dataDir, 'uploads');
    cfg.backupsDir = overrides.backupsDir ?? path.join(cfg.dataDir, 'backups');
  }
  for (const d of [cfg.dataDir, cfg.uploadsDir, cfg.backupsDir]) fs.mkdirSync(d, { recursive: true });
  return cfg;
}

/** Non-internal IPv4 addresses, used to build join URLs / QR codes that phones can reach. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

export function baseUrlFor(cfg: Config, requestOrigin?: string | null): string {
  if (cfg.publicBaseUrl) return cfg.publicBaseUrl;
  if (requestOrigin && !/\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(requestOrigin)) return requestOrigin;
  const ip = lanAddresses()[0];
  const port = cfg.port === 80 ? '' : `:${cfg.port}`;
  if (ip) return `http://${ip}${port}`;
  return requestOrigin ?? `http://localhost${port}`;
}
