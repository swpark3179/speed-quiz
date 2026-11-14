import { AppError } from '@sq/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, type SessionAdmin, type SessionStore } from './sessions';

declare module 'fastify' {
  interface FastifyRequest {
    admin: SessionAdmin | null;
  }
}

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'speed-quiz';

export function registerAuth(app: FastifyInstance, sessions: SessionStore): void {
  app.decorateRequest('admin', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies?.[SESSION_COOKIE];
    req.admin = token ? sessions.lookup(token) : null;
  });
}

/** preHandler for /api/admin/* and other admin-only routes. */
export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.admin) throw new AppError('UNAUTHORIZED');
  requireCsrf(req);
}

/** Mutating requests must carry the custom header (cross-site forms cannot set it without a preflight). */
export function requireCsrf(req: FastifyRequest): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  if (req.headers[CSRF_HEADER] !== CSRF_VALUE) throw new AppError('FORBIDDEN', '잘못된 요청이에요. 페이지를 새로고침해 주세요.');
}
