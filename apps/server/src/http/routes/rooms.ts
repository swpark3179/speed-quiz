import { AppError, RoomInput } from '@sq/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../../context';
import { requireAdmin } from '../../auth/plugin';
import { baseUrlFor, lanAddresses } from '../../config';
import { idParam, parse } from '../validate';

export function requestOrigin(req: FastifyRequest): string | null {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== 'null') return origin.replace(/\/+$/, '');
  const host = req.headers.host;
  return host ? `${req.protocol}://${host}` : null;
}

export function roomRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { rooms, results, config, registry } = ctx;
  const id = (req: FastifyRequest) => idParam((req.params as { id: string }).id);

  app.get('/api/admin/rooms', { preHandler: requireAdmin }, async () => rooms.list());
  app.get('/api/admin/rooms/:id', { preHandler: requireAdmin }, async (req) => rooms.get(id(req)));
  app.post('/api/admin/rooms', { preHandler: requireAdmin }, async (req) => rooms.create(parse(RoomInput, req.body), req.admin!.id));
  app.put('/api/admin/rooms/:id', { preHandler: requireAdmin }, async (req) => rooms.update(id(req), parse(RoomInput, req.body)));
  app.delete('/api/admin/rooms/:id', { preHandler: requireAdmin }, async (req) => {
    rooms.remove(id(req));
    return { ok: true };
  });
  app.post('/api/admin/rooms/:id/confirm', { preHandler: requireAdmin }, async (req) =>
    rooms.confirm(id(req), baseUrlFor(config, requestOrigin(req))),
  );
  app.post('/api/admin/rooms/:id/unconfirm', { preHandler: requireAdmin }, async (req) => rooms.unconfirm(id(req)));
  app.post('/api/admin/rooms/:id/clone', { preHandler: requireAdmin }, async (req) => rooms.clone(id(req), req.admin!.id));
  app.post('/api/admin/rooms/:id/reset', { preHandler: requireAdmin }, async (req) => {
    const engine = registry.get(id(req));
    if (!engine) throw new AppError('INVALID_TRANSITION');
    engine.reset();
    return rooms.get(id(req));
  });
  app.post('/api/admin/rooms/:id/presenter-key/rotate', { preHandler: requireAdmin }, async (req) =>
    rooms.rotatePresenterKey(id(req)),
  );

  app.get('/api/admin/rooms/:id/results', { preHandler: requireAdmin }, async (req) => results.results(id(req)));
  app.get('/api/admin/rooms/:id/results.csv', { preHandler: requireAdmin }, async (req, reply) => {
    const roomId = id(req);
    const type = (req.query as { type?: string }).type === 'answers' ? 'answers' : 'ranking';
    const csv = type === 'answers' ? results.answersCsv(roomId) : results.rankingCsv(roomId);
    const title = results.results(roomId).room.title.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${title}_${type === 'answers' ? '응답' : '순위'}.csv`;
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="results.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return csv;
  });

  app.get('/api/admin/server-info', { preHandler: requireAdmin }, async (req) => ({
    lanAddresses: lanAddresses(),
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    suggestedBaseUrl: baseUrlFor(config, requestOrigin(req)),
  }));
}
