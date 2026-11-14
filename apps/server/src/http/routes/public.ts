import { AppError } from '@sq/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { parse } from '../validate';

const CodeParam = z.object({ code: z.string().regex(/^\d{6}$/) });
const JoinBody = z.object({ nickname: z.string().max(100) });

export function publicRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { registry } = ctx;

  app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

  app.get('/api/public/rooms/:code', async (req) => {
    const p = CodeParam.safeParse(req.params);
    if (!p.success) throw new AppError('ROOM_NOT_FOUND');
    const engine = registry.byCode(p.data.code);
    if (!engine || engine.phase === 'ENDED') throw new AppError('ROOM_NOT_FOUND');
    return { id: engine.id, title: engine.title, phase: engine.phase, joinable: engine.isJoinable() };
  });

  // Venue phones often share one public IP (NAT) — keep this limit generous.
  app.post('/api/public/rooms/:code/join', { config: { rateLimit: { max: 1200, timeWindow: '1 minute' } } }, async (req) => {
    const p = CodeParam.safeParse(req.params);
    if (!p.success) throw new AppError('ROOM_NOT_FOUND');
    const body = parse(JoinBody, req.body);
    const engine = registry.byCode(p.data.code);
    if (!engine || engine.phase === 'ENDED') throw new AppError('ROOM_NOT_FOUND');
    const r = engine.join(body.nickname);
    return { ...r, roomId: engine.id, code: engine.code, title: engine.title };
  });
}
