import { AppError } from '@sq/shared';
import type { z } from 'zod';

/** Parse with a zod schema; throws a 400 AppError carrying the first (Korean) issue message. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path?.length ? ` (${issue.path.join('.')})` : '';
    throw new AppError('BAD_REQUEST', `${issue?.message ?? '입력값을 확인해 주세요.'}${where}`);
  }
  return r.data;
}

export function idParam(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new AppError('NOT_FOUND');
  return n;
}
