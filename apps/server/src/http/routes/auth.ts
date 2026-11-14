import { AppError, AdminCreateInput, AdminPatchInput, LoginInput, PasswordChangeInput, ProfilePatchInput } from '@sq/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { hashPassword, verifyPassword } from '../../auth/password';
import { requireAdmin, requireCsrf, requireMainAdmin } from '../../auth/plugin';
import { SESSION_COOKIE } from '../../auth/sessions';
import { adminsRepo, toAdminDto } from '../../db/repos/admins';
import { idParam, parse } from '../validate';

export function authRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, sessions, config } = ctx;

  app.post('/api/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    requireCsrf(req);
    const body = parse(LoginInput, req.body);
    const row = adminsRepo.byUsername(db, body.username);
    // Always run a hash comparison so timing doesn't reveal whether the username exists.
    const okPw = await verifyPassword(body.password, row?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!row || !okPw) throw new AppError('INVALID_CREDENTIALS');
    if (row.disabled) throw new AppError('ACCOUNT_DISABLED');
    const token = sessions.create(row.id);
    adminsRepo.touchLogin(db, row.id);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    });
    return toAdminDto(adminsRepo.byId(db, row.id)!);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    requireCsrf(req);
    const token = req.cookies[SESSION_COOKIE];
    if (token) sessions.revoke(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    if (!req.admin) throw new AppError('UNAUTHORIZED');
    return toAdminDto(adminsRepo.byId(db, req.admin.id)!);
  });

  app.patch('/api/auth/me', { preHandler: requireAdmin }, async (req) => {
    const body = parse(ProfilePatchInput, req.body);
    adminsRepo.update(db, req.admin!.id, { displayName: body.displayName });
    return toAdminDto(adminsRepo.byId(db, req.admin!.id)!);
  });

  app.put('/api/auth/password', { preHandler: requireAdmin }, async (req) => {
    const body = parse(PasswordChangeInput, req.body);
    const row = adminsRepo.byId(db, req.admin!.id)!;
    if (!(await verifyPassword(body.currentPassword, row.password_hash))) {
      throw new AppError('INVALID_CREDENTIALS', '현재 비밀번호가 올바르지 않아요.');
    }
    adminsRepo.setPassword(db, row.id, await hashPassword(body.newPassword));
    sessions.revokeAllFor(row.id, req.admin!.sessionHash);
    return { ok: true };
  });

  /* ---- admin accounts ---- */

  app.get('/api/admin/admins', { preHandler: requireMainAdmin }, async () => adminsRepo.list(db).map(toAdminDto));

  app.post('/api/admin/admins', { preHandler: requireMainAdmin }, async (req) => {
    const body = parse(AdminCreateInput, req.body);
    if (adminsRepo.byUsername(db, body.username)) throw new AppError('USERNAME_TAKEN');
    const id = adminsRepo.insert(db, {
      username: body.username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password),
    });
    return toAdminDto(adminsRepo.byId(db, id)!);
  });

  app.patch('/api/admin/admins/:id', { preHandler: requireMainAdmin }, async (req) => {
    const id = idParam((req.params as { id: string }).id);
    const body = parse(AdminPatchInput, req.body);
    const row = adminsRepo.byId(db, id);
    if (!row) throw new AppError('NOT_FOUND');
    if (body.disabled && id === req.admin!.id) throw new AppError('CANNOT_DISABLE_SELF');
    adminsRepo.update(db, id, { displayName: body.displayName, disabled: body.disabled });
    if (body.password) adminsRepo.setPassword(db, id, await hashPassword(body.password));
    if (body.disabled || body.password) sessions.revokeAllFor(id, id === req.admin!.id ? req.admin!.sessionHash : undefined);
    return toAdminDto(adminsRepo.byId(db, id)!);
  });
}
