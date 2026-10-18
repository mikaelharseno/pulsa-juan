import { z } from 'zod';

import { AgentStatus, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { creditSaldo, debitSaldo } from './saldo.service';

export const agentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  referralMarkup: z.number().int().min(0).optional(),
  poin: z.number().int().min(0).optional(),
});

export const adjustSaldoSchema = z.object({
  delta: z.number().int().refine((d) => d !== 0, 'Delta tidak boleh 0'),
  note: z.string().trim().min(1).max(200),
});

export async function listAgents(q: { search?: string; status?: string }) {
  const where: Prisma.AgentWhereInput = {};
  if (q.status && q.status !== 'ALL') where.status = q.status as AgentStatus;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
      { phone: { contains: q.search } },
      { commisionUniqueId: { contains: q.search.toUpperCase() } },
    ];
  }
  return prisma.agent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true, name: true, email: true, phone: true, status: true, saldo: true, hutang: true, poin: true,
      commisionUniqueId: true, saldoKomisi: true, referralMarkup: true, createdAt: true, googleSub: true,
    },
  });
}

export async function getAgentDetail(id: string) {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw notFound('Agen tidak ditemukan');
  const [up, children, ledger, unclaimed] = await Promise.all([
    prisma.mitraConnection.findUnique({ where: { childCommisionId: agent.commisionUniqueId } }),
    prisma.mitraConnection.findMany({ where: { parentCommisionId: agent.commisionUniqueId } }),
    prisma.saldoLedger.findMany({ where: { agentId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.agentMarkupCommision.aggregate({ where: { beneficiaryCommisionId: agent.commisionUniqueId, status: 'UNCLAIMED' }, _sum: { amount: true } }),
  ]);
  const codes = [...children.map((c) => c.childCommisionId), ...(up ? [up.parentCommisionId] : [])];
  const related = codes.length
    ? await prisma.agent.findMany({ where: { commisionUniqueId: { in: codes } }, select: { id: true, name: true, commisionUniqueId: true } })
    : [];
  const byCode = Object.fromEntries(related.map((a) => [a.commisionUniqueId, a]));
  const { passwordHash: _p, ...safe } = agent;
  return {
    ...safe,
    hasPassword: !!agent.passwordHash,
    upline: up ? { ...up, agent: byCode[up.parentCommisionId] ?? null } : null,
    downline: children.map((c) => ({ ...c, agent: byCode[c.childCommisionId] ?? null })),
    ledger,
    unclaimedCommission: unclaimed._sum.amount ?? 0,
  };
}

export async function updateAgent(adminId: string, id: string, input: z.infer<typeof agentUpdateSchema>) {
  const agent = await prisma.agent.update({ where: { id }, data: input });
  await audit(adminId, 'AGENT_UPDATE', 'Agent', id, input);
  return agent;
}

export async function adjustSaldo(adminId: string, id: string, input: z.infer<typeof adjustSaldoSchema>) {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw notFound('Agen tidak ditemukan');
  const saldo = await prisma.$transaction(async (tx) => {
    if (input.delta > 0) return creditSaldo(tx, id, input.delta, 'ADJUSTMENT', 'admin:' + adminId, input.note);
    try {
      return await debitSaldo(tx, id, -input.delta, 'ADJUSTMENT', 'admin:' + adminId, input.note);
    } catch {
      throw badRequest('Saldo agen tidak cukup untuk dikurangi');
    }
  });
  await audit(adminId, 'AGENT_ADJUST_SALDO', 'Agent', id, input);
  return { id, saldo };
}
