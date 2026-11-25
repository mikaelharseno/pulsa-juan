import { PackagePublic, SegmentTree } from 'pulsa-juan-common';
import { z } from 'zod';

import { Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { packagesForTree } from './package.service';

// Harga Agen + Komisi (meeting 19 Nov 2026). Every package has a default agent
// price (Package.hargaAgen) and a default referral commission
// (Package.commission), both in rupiah. AgentPackageOverride holds per-agent
// exceptions:
//   hargaAgen  = what THIS agent pays for the package
//   commission = what THIS agent earns when one of its mitra buys the package
// The app's price list and the order's debit both go through packagesForAgent,
// so the client total and the server's PRICE_CHANGED check always agree.

/** The packages a tree can show, priced for one agent. */
export async function packagesForAgent(tree: SegmentTree, agentId: string): Promise<Record<string, PackagePublic>> {
  const packages = await packagesForTree(tree);
  const ids = Object.keys(packages);
  if (!ids.length) return packages;
  const overrides = await prisma.agentPackageOverride.findMany({
    where: { agentId, packageId: { in: ids }, hargaAgen: { not: null } },
    select: { packageId: true, hargaAgen: true },
  });
  for (const o of overrides) packages[o.packageId] = { ...packages[o.packageId], hargaAgen: o.hargaAgen! };
  return packages;
}

/** One package's agent price for one agent (override, else default). */
export async function agentPriceOf(agentId: string, packageId: string, defaultPrice: number) {
  const o = await prisma.agentPackageOverride.findUnique({ where: { agentId_packageId: { agentId, packageId } }, select: { hargaAgen: true } });
  return o?.hargaAgen ?? defaultPrice;
}

/**
 * What the upline earns for one order: its own override for the package, else
 * the package's default. Orders without a package (free amounts, bills) earn 0.
 */
export async function commissionFor(uplineAgentId: string, packageId: string | null | undefined) {
  if (!packageId) return 0;
  const [o, pkg] = await Promise.all([
    prisma.agentPackageOverride.findUnique({ where: { agentId_packageId: { agentId: uplineAgentId, packageId } }, select: { commission: true } }),
    prisma.package.findUnique({ where: { id: packageId }, select: { commission: true } }),
  ]);
  return Math.max(0, o?.commission ?? pkg?.commission ?? 0);
}

// ---- admin: the Harga Agen / Komisi sheets ----

export const pricingQuerySchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  /** category prefix, e.g. "TSEL" for every Telkomsel category */
  prefix: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  onlyOverrides: z.enum(['1', 'true']).optional(),
  includeInactive: z.enum(['1', 'true']).optional(),
});

export async function listPricing(query: z.infer<typeof pricingQuerySchema>) {
  const where: Prisma.PackageWhereInput = {};
  if (!query.includeInactive) where.isActive = true;
  if (query.category) where.category = query.category;
  else if (query.prefix) where.category = { startsWith: query.prefix };
  if (query.q) where.OR = [{ code: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }];
  if (query.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: query.agentId }, select: { id: true } });
    if (!agent) throw notFound('Agen tidak ditemukan');
    if (query.onlyOverrides) where.agentOverrides = { some: { agentId: query.agentId } };
  }
  const rows = await prisma.package.findMany({
    where,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { hargaAgen: 'asc' }],
    select: {
      id: true, code: true, name: true, category: true, supplierName: true, isActive: true,
      hargaBeli: true, hargaAgen: true, commission: true, priceLocked: true,
      agentOverrides: query.agentId ? { where: { agentId: query.agentId }, select: { hargaAgen: true, commission: true } } : false,
    },
  });
  const categories = await prisma.package.groupBy({ by: ['category'], where: query.includeInactive ? {} : { isActive: true }, orderBy: { category: 'asc' } });
  return {
    categories: categories.map((c) => c.category),
    rows: rows.map(({ agentOverrides, ...p }) => {
      const o = (agentOverrides as { hargaAgen: number | null; commission: number | null }[] | undefined)?.[0];
      return { ...p, override: query.agentId ? { hargaAgen: o?.hargaAgen ?? null, commission: o?.commission ?? null } : null };
    }),
  };
}

export const pricingUpdateSchema = z.object({
  /** absent = change the defaults for every agent */
  agentId: z.string().trim().min(1).optional(),
  field: z.enum(['hargaAgen', 'commission']),
  rows: z
    .array(z.object({ packageId: z.string().min(1), value: z.number().int().min(0).max(100_000_000).nullable() }))
    .min(1)
    .max(5000),
});

/** Sets defaults (no agentId) or one agent's overrides; null removes an override. */
export async function updatePricing(adminId: string, input: z.infer<typeof pricingUpdateSchema>) {
  const { agentId, field } = input;
  const ids = [...new Set(input.rows.map((r) => r.packageId))];
  const packages = await prisma.package.findMany({ where: { id: { in: ids } }, select: { id: true, hargaAgen: true, supplierName: true } });
  if (packages.length !== ids.length) throw badRequest('Ada produk yang tidak ditemukan');
  const byId = new Map(packages.map((p) => [p.id, p]));

  if (!agentId) {
    if (input.rows.some((r) => r.value === null)) throw badRequest('Harga / komisi default tidak boleh kosong');
    await prisma.$transaction(
      input.rows.map((r) => {
        const p = byId.get(r.packageId)!;
        const data: Prisma.PackageUpdateInput = { [field]: r.value! };
        // a hand-set default price on an updater-managed package survives the next sheet upload
        if (field === 'hargaAgen' && r.value !== p.hargaAgen && ['OtomaX', 'Pasar'].includes(p.supplierName ?? '')) data.priceLocked = true;
        return prisma.package.update({ where: { id: r.packageId }, data });
      }),
    );
  } else {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
    if (!agent) throw notFound('Agen tidak ditemukan');
    await prisma.$transaction(async (tx) => {
      for (const r of input.rows) {
        const key = { agentId_packageId: { agentId, packageId: r.packageId } };
        const row = await tx.agentPackageOverride.upsert({ where: key, update: { [field]: r.value }, create: { agentId, packageId: r.packageId, [field]: r.value } });
        if (row.hargaAgen === null && row.commission === null) await tx.agentPackageOverride.delete({ where: { id: row.id } });
      }
    });
  }
  await audit(adminId, field === 'hargaAgen' ? 'PRICING_HARGA_AGEN' : 'PRICING_COMMISSION', agentId ? 'Agent' : 'Package', agentId ?? 'all', {
    rows: input.rows.length,
    sample: input.rows.slice(0, 20),
  });
  return { updated: input.rows.length };
}
