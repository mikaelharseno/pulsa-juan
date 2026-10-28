import { z } from 'zod';

import { Agent, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';

// The agent's own selling price, for the income recap only (the agent charges its
// customer offline; we never collect it). Margins are set once per service, with
// a default for the rest; each order freezes total + margin as sellPrice, and
// the agent can correct it per order afterwards.

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

/** null resets it to the agent's current margin for that service. */
export async function setSellPrice(agent: Agent, transactionId: string, sellPrice: number | null) {
  const trx = await prisma.transaction.findFirst({ where: { id: transactionId, agentId: agent.id }, select: { id: true, total: true, segmentId: true, status: true } });
  if (!trx) throw notFound('Transaksi tidak ditemukan');
  if (trx.status === 'FAILED' || trx.status === 'REFUNDED') throw badRequest('Transaksi gagal / direfund tidak punya harga jual');
  const value = sellPrice ?? sellPriceFor(agent, trx.segmentId, trx.total);
  return prisma.transaction.update({ where: { id: trx.id }, data: { sellPrice: value }, include: { segment: { select: { slug: true, iconUrl: true } } } });
}
