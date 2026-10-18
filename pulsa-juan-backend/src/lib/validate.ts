import { z } from 'zod';

import { badRequest } from './errors';

/** Parses with zod; the first issue becomes a 400 `{ error }`. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? issue.path.join('.') + ': ' : '';
    throw badRequest(path + issue.message, 'VALIDATION');
  }
  return result.data;
}

export const intLike = z.coerce.number().int();
export const rupiah = z.coerce.number().int().min(0);
