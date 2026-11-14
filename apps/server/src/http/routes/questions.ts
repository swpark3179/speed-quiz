import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppError, QuestionInput, QuestionListQuery } from '@sq/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { requireAdmin } from '../../auth/plugin';
import { imageSize, sniffImage } from '../../security/image';
import { idParam, parse } from '../validate';

export function questionRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { questions, config } = ctx;

  app.get('/api/admin/questions', { preHandler: requireAdmin }, async (req) => {
    const q = parse(QuestionListQuery, req.query);
    return { ...questions.list(req.admin!.id, q), page: q.page, pageSize: q.pageSize, tags: questions.tags(req.admin!.id) };
  });

  app.get('/api/admin/questions/:id', { preHandler: requireAdmin }, async (req) =>
    questions.get(idParam((req.params as { id: string }).id), req.admin!.id),
  );

  app.post('/api/admin/questions', { preHandler: requireAdmin }, async (req) =>
    questions.create(parse(QuestionInput, req.body), req.admin!.id),
  );

  app.put('/api/admin/questions/:id', { preHandler: requireAdmin }, async (req) =>
    questions.update(idParam((req.params as { id: string }).id), parse(QuestionInput, req.body), req.admin!.id),
  );

  app.delete('/api/admin/questions/:id', { preHandler: requireAdmin }, async (req) => {
    questions.remove(idParam((req.params as { id: string }).id), req.admin!.id);
    return { ok: true };
  });

  app.post('/api/admin/questions/:id/duplicate', { preHandler: requireAdmin }, async (req) =>
    questions.duplicate(idParam((req.params as { id: string }).id), req.admin!.id),
  );

  app.post('/api/admin/uploads', { preHandler: requireAdmin }, async (req) => {
    const file = await req.file();
    if (!file) throw new AppError('UPLOAD_INVALID');
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      throw new AppError('UPLOAD_TOO_LARGE');
    }
    const ext = sniffImage(buf);
    if (!ext) throw new AppError('UPLOAD_INVALID');
    const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
    const target = path.join(config.uploadsDir, name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, buf);
    const size = imageSize(buf, ext);
    return { url: `/uploads/${name}`, width: size?.width ?? null, height: size?.height ?? null };
  });
}
