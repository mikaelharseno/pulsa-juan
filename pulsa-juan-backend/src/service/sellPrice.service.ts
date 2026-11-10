import { z } from 'zod';

import { Agent, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';

// The agent's own selling price (the agent charges its customer offline; we never
// collect it): used for the income recap and the customer's bon. Margins are set
// once per service, with a default for the rest. Setting a price on an order of a
// product also saves it for that product (AgentSellPrice), and a saved product
// price beats the margin on the next order of that product.

const rp = z.number().int().min(0).max(1_000_000);

export const sellMarginsSchema = z.object({
  default: rp,
  bySegment: z.record(z.string().min(1).max(40), rp).default({}),
});
export type SellMargins = z.infer<typeof sellMarginsSchema>;

export const sellPriceSchema = z.object({ sellPrice: z.number().int().min(0).max(100_000_000).nullable() });

/** Stored as { default?, [segmentId] } so a margin lookup is one key. */
export function readSellMargins(agent: Pick<Agent, 'sellMargins'>): SellMargins {
  const raw = (agent.sellMargins ?? {}) as Record<string, unknown>;
  const bySegment: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (k !== 'default' && typeof v === 'number') bySegment[k] = v;
  return { default: typeof raw.default === 'number' ? raw.default : 0, bySegment };
}

export function sellPriceFor(agent: Pick<Agent, 'sellMargins'>, segmentId: string, total: number) {
  const m = readSellMargins(agent);
  return total + (m.bySegment[segmentId] ?? m.default);
}

export async function saveSellMargins(agentId: string, input: SellMargins) {
  const stored: Record<string, number> = { default: input.default, ...input.bySegment };
  const agent = await prisma.agent.update({ where: { id: agentId }, data: { sellMargins: stored as Prisma.InputJsonValue } });
  return readSellMargins(agent);
}

/** The sell price a new order starts with: the saved product price, else total + margin. */
export async function initialSellPrice(agent: Pick<Agent, 'id' | 'sellMargins'>, segmentId: string, packageId: string | null, total: number) {
  if (packageId) {
    const saved = await prisma.agentSellPrice.findUnique({ where: { agentId_packageId: { agentId: agent.id, packageId } } });
    if (saved) return saved.sellPrice;
  }
  return sellPriceFor(agent, segmentId, total);
}

/**
 * Sets the order's sell price and saves it for that product, so the next order
 * of it starts there. null resets the order to the margin and forgets the saved
 * product price.
 */
export async function setSellPrice(agent: Agent, transactionId: string, sellPrice: number | null) {
  const trx = await prisma.transaction.findFirst({ where: { id: transactionId, agentId: agent.id }, select: { id: true, total: true, segmentId: true, status: true, packageId: true } });
  if (!trx) throw notFound('Transaksi tidak ditemukan');
  if (trx.status === 'FAILED' || trx.status === 'REFUNDED') throw badRequest('Transaksi gagal / direfund tidak punya harga jual');
  const value = sellPrice ?? sellPriceFor(agent, trx.segmentId, trx.total);
  return prisma.$transaction(async (tx) => {
    if (trx.packageId) {
      const key = { agentId_packageId: { agentId: agent.id, packageId: trx.packageId } };
      if (sellPrice === null) await tx.agentSellPrice.deleteMany({ where: { agentId: agent.id, packageId: trx.packageId } });
      else await tx.agentSellPrice.upsert({ where: key, update: { sellPrice }, create: { agentId: agent.id, packageId: trx.packageId, sellPrice } });
    }
    return tx.transaction.update({ where: { id: trx.id }, data: { sellPrice: value }, include: { segment: { select: { slug: true, iconUrl: true } } } });
  });
}

/** Saved product prices, newest first, with the product's current agent price. */
export async function listSellPrices(agentId: string) {
  const rows = await prisma.agentSellPrice.findMany({
    where: { agentId },
    orderBy: { updatedAt: 'desc' },
    include: { package: { select: { name: true, hargaAgen: true, category: true, isActive: true } } },
  });
  return rows.map((r) => ({ id: r.id, packageId: r.packageId, name: r.package.name, category: r.package.category, isActive: r.package.isActive, hargaAgen: r.package.hargaAgen, sellPrice: r.sellPrice, updatedAt: r.updatedAt }));
}

export async function deleteSellPrice(agentId: string, id: string) {
  const { count } = await prisma.agentSellPrice.deleteMany({ where: { id, agentId } });
  if (!count) throw notFound('Harga jual tidak ditemukan');
  return { ok: true };
}
