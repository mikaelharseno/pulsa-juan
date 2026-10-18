import { Prisma } from '../../prisma/generated';

/** Prisma Decimals serialise as strings; the clients want numbers. */
export function toPlain<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return Number(value) as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlain(v);
    return out as T;
  }
  return value;
}
