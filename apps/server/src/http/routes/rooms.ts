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

  /** Resolves the :id param and enforces that the signed-in admin created the room. */
  const owned = (req: FastifyRequest): number => {
    const roomId = id(req);
    rooms.assertOwned(roomId, req.admin!.id);
    return roomId;
  };

  app.get('/api/admin/rooms', { preHandler: requireAdmin }, async (req) => rooms.list(req.admin!.id));
  app.get('/api/admin/rooms/:id', { preHandler: requireAdmin }, async (req) => rooms.get(owned(req)));
  app.post('/api/admin/rooms', { preHandler: requireAdmin }, async (req) => rooms.create(parse(RoomInput, req.body), req.admin!.id));
  app.put('/api/admin/rooms/:id', { preHandler: requireAdmin }, async (req) => rooms.update(owned(req), parse(RoomInput, req.body)));
  app.delete('/api/admin/rooms/:id', { preHandler: requireAdmin }, async (req) => {
    rooms.remove(owned(req));
    return { ok: true };
  });
  app.post('/api/admin/rooms/:id/confirm', { preHandler: requireAdmin }, async (req) =>
    rooms.confirm(owned(req), baseUrlFor(config, requestOrigin(req))),
  );
  app.post('/api/admin/rooms/:id/unconfirm', { preHandler: requireAdmin }, async (req) => rooms.unconfirm(owned(req)));
  app.post('/api/admin/rooms/:id/clone', { preHandler: requireAdmin }, async (req) => rooms.clone(owned(req), req.admin!.id));
  app.post('/api/admin/rooms/:id/reset', { preHandler: requireAdmin }, async (req) => {
    const roomId = owned(req);
    const engine = registry.get(roomId);
    if (!engine) throw new AppError('INVALID_TRANSITION');
    engine.reset();
    return rooms.get(roomId);
  });
  app.post('/api/admin/rooms/:id/presenter-key/rotate', { preHandler: requireAdmin }, async (req) =>
    rooms.rotatePresenterKey(owned(req)),
  );

  app.get('/api/admin/rooms/:id/results', { preHandler: requireAdmin }, async (req) => results.results(owned(req)));
  app.get('/api/admin/rooms/:id/results.csv', { preHandler: requireAdmin }, async (req, reply) => {
    const roomId = owned(req);
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
