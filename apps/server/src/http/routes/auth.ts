import {
  AppError,
  AdminCreateInput,
  AdminPatchInput,
  AdminStatsQuery,
  LoginInput,
  PasswordChangeInput,
  ProfilePatchInput,
  SignupInput,
  type AdminRole,
} from '@sq/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../../context';
import { hashPassword, verifyPassword } from '../../auth/password';
import { requireAdmin, requireCsrf, requireMainAdmin } from '../../auth/plugin';
import { SESSION_COOKIE } from '../../auth/sessions';
import { adminsRepo, toAdminDto } from '../../db/repos/admins';
import { idParam, parse } from '../validate';

export function authRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, sessions, config } = ctx;

  const setSessionCookie = (reply: FastifyReply, adminId: number): void => {
    const token = sessions.create(adminId);
    adminsRepo.touchLogin(db, adminId);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    });
  };

  /** Insert a new admin after re-checking id/nickname uniqueness synchronously (no await between check and insert). */
  const insertUnique = (a: { username: string; displayName: string; passwordHash: string; role?: AdminRole }): number =>
    db.tx(() => {
      if (adminsRepo.byUsername(db, a.username)) throw new AppError('USERNAME_TAKEN');
      if (adminsRepo.byDisplayName(db, a.displayName)) throw new AppError('DISPLAY_NAME_TAKEN');
      return adminsRepo.insert(db, a);
    });

  app.post('/api/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    requireCsrf(req);
    const body = parse(LoginInput, req.body);
    const row = adminsRepo.byUsername(db, body.username);
    // Always run a hash comparison so timing doesn't reveal whether the username exists.
    const okPw = await verifyPassword(body.password, row?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!row || !okPw) throw new AppError('INVALID_CREDENTIALS');
    if (row.disabled) throw new AppError('ACCOUNT_DISABLED');
    setSessionCookie(reply, row.id);
    return toAdminDto(adminsRepo.byId(db, row.id)!);
  });

  /* ---- self-service sign-up (auto-approved, regular admin) ---- */

  app.get('/api/auth/signup', async () => ({ enabled: config.signupEnabled }));

  app.post('/api/auth/signup', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    requireCsrf(req);
    if (!config.signupEnabled) throw new AppError('SIGNUP_DISABLED');
    const body = parse(SignupInput, req.body);
    // Cheap pre-check so taken names fail fast without paying for a hash; insertUnique re-checks atomically.
    if (adminsRepo.byUsername(db, body.username)) throw new AppError('USERNAME_TAKEN');
    if (adminsRepo.byDisplayName(db, body.displayName)) throw new AppError('DISPLAY_NAME_TAKEN');
    const passwordHash = await hashPassword(body.password);
    const id = insertUnique({ username: body.username, displayName: body.displayName, passwordHash, role: 'ADMIN' });
    req.log.info({ adminId: id }, 'admin signed up');
    setSessionCookie(reply, id);
    return toAdminDto(adminsRepo.byId(db, id)!);
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
    if (adminsRepo.byDisplayName(db, body.displayName, req.admin!.id)) throw new AppError('DISPLAY_NAME_TAKEN');
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
    if (adminsRepo.byDisplayName(db, body.displayName)) throw new AppError('DISPLAY_NAME_TAKEN');
    const id = insertUnique({
      username: body.username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password),
    });
    return toAdminDto(adminsRepo.byId(db, id)!);
  });

  app.patch('/api/admin/admins/:id', { preHandler: requireMainAdmin }, async (req) => {
    const id = idParam((req.params as { id: string }).id);
    const body = parse(AdminPatchInput, req.body);
    if (!adminsRepo.byId(db, id)) throw new AppError('NOT_FOUND');
    const self = id === req.admin!.id;
    if (body.disabled && self) throw new AppError('CANNOT_DISABLE_SELF');
    if (body.role === 'ADMIN' && self) throw new AppError('CANNOT_DEMOTE_SELF');
    const passwordHash = body.password ? await hashPassword(body.password) : undefined;
    db.tx(() => {
      const row = adminsRepo.byId(db, id);
      if (!row) throw new AppError('NOT_FOUND');
      if (body.displayName !== undefined && adminsRepo.byDisplayName(db, body.displayName, id)) {
        throw new AppError('DISPLAY_NAME_TAKEN');
      }
      adminsRepo.update(db, id, { displayName: body.displayName, disabled: body.disabled, role: body.role });
      // Never leave the service without an active main admin (demotion or disabling of another main).
      if (row.role === 'MAIN' && adminsRepo.countActiveMain(db) === 0) throw new AppError('LAST_MAIN_ADMIN');
      if (passwordHash) adminsRepo.setPassword(db, id, passwordHash);
    });
    // Role is re-read from the DB on every request, so a promotion/demotion takes effect immediately.
    if (body.disabled || body.password) sessions.revokeAllFor(id, id === req.admin!.id ? req.admin!.sessionHash : undefined);
    return toAdminDto(adminsRepo.byId(db, id)!);
  });

  /* ---- usage overview (counts only, no question/room content) ---- */

  app.get('/api/admin/stats', { preHandler: requireMainAdmin }, async (req) => {
    const q = parse(AdminStatsQuery, req.query);
    return ctx.stats.overview(q.days, q.tz);
  });
}
