import { PrefixEntry, PROVIDERS } from 'pulsa-juan-common';
import { z } from 'zod';

import { prisma } from '../../prisma/client';

export const prefixSchema = z.object({
  prefix: z.string().regex(/^08\d{2,4}$/, 'Prefix harus 4–6 digit diawali 08'),
  provider: z.enum(PROVIDERS),
  isActive: z.boolean().optional(),
});

let cache: { at: number; entries: PrefixEntry[] } | null = null;
const CACHE_MS = 60_000;

export async function getPrefixEntries(): Promise<PrefixEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.entries;
  const rows = await prisma.providerPrefix.findMany({ where: { isActive: true } });
  const entries = rows.map((r) => ({ prefix: r.prefix, provider: r.provider }));
  cache = { at: Date.now(), entries };
  return entries;
}

export function invalidatePrefixCache() {
  cache = null;
}

export async function listPrefixes() {
  return prisma.providerPrefix.findMany({ orderBy: [{ provider: 'asc' }, { prefix: 'asc' }] });
}

export async function upsertPrefix(data: z.infer<typeof prefixSchema>) {
  invalidatePrefixCache();
  return prisma.providerPrefix.upsert({
    where: { prefix: data.prefix },
    update: { provider: data.provider, isActive: data.isActive ?? true },
    create: { prefix: data.prefix, provider: data.provider, isActive: data.isActive ?? true },
  });
}

export async function deletePrefix(id: string) {
  invalidatePrefixCache();
  await prisma.providerPrefix.delete({ where: { id } });
}
