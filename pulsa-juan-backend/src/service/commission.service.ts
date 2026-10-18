import { Agent, CommissionStatus } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest } from '../lib/errors';
import { creditSaldo } from './saldo.service';

export async function commissionSummary(agent: Agent) {
  const code = agent.commisionUniqueId;
  const entries = await prisma.agentMarkupCommision.findMany({
    where: { beneficiaryCommisionId: code },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      transaction: { select: { trxNumber: true, status: true, segmentLabel: true, createdAt: true } },
      sourceAgent: { select: { name: true } },
    },
  });
  let unclaimedTotal = 0;
  let pendingTotal = 0;
  for (const e of entries) {
    if (e.status !== 'UNCLAIMED') continue;
    if (e.transaction.status === 'SUCCESS') unclaimedTotal += e.amount;
    else if (e.transaction.status === 'PENDING') pendingTotal += e.amount;
  }
  return {
    unclaimedTotal,
    pendingTotal,
    saldoKomisi: Number(agent.saldoKomisi),
    entries: entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      level: e.level,
      status: e.status,
      claimedAt: e.claimedAt,
      createdAt: e.createdAt,
      sourceAgentName: e.sourceAgent.name,
      transaction: e.transaction,
    })),
  };
}

/** Claims every UNCLAIMED entry whose source transaction succeeded. Idempotent per entry. */
export async function claimCommissions(agent: Agent) {
  const code = agent.commisionUniqueId;
  const candidates = await prisma.agentMarkupCommision.findMany({
    where: { beneficiaryCommisionId: code, status: 'UNCLAIMED', transaction: { status: 'SUCCESS' } },
    select: { id: true, amount: true },
  });
  if (candidates.length === 0) throw badRequest('Tidak ada komisi yang bisa diklaim');

  return prisma.$transaction(async (tx) => {
    let total = 0;
    const claimedIds: string[] = [];
    const now = new Date();
    for (const c of candidates) {
      // per-row guard: a concurrent claim cannot credit the same entry twice
      const res = await tx.agentMarkupCommision.updateMany({
        where: { id: c.id, status: 'UNCLAIMED' },
        data: { status: 'CLAIMED', claimedAt: now },
      });
      if (res.count === 1) {
        total += c.amount;
        claimedIds.push(c.id);
      }
    }
    if (total === 0) throw badRequest('Komisi sudah diklaim');
    const saldo = await creditSaldo(tx, agent.id, total, 'COMMISSION', claimedIds.join(','), `Klaim komisi ${claimedIds.length} transaksi`);
    const updated = await tx.agent.update({ where: { id: agent.id }, data: { saldoKomisi: { increment: total } }, select: { saldoKomisi: true } });
    return { claimed: total, count: claimedIds.length, saldo, saldoKomisi: Number(updated.saldoKomisi) };
  });
}

export async function adminListCommissions(filter: { agentId?: string; status?: string }) {
  const where: { beneficiaryCommisionId?: string; status?: CommissionStatus } = {};
  if (filter.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: filter.agentId }, select: { commisionUniqueId: true } });
    where.beneficiaryCommisionId = agent?.commisionUniqueId ?? '__none__';
  }
  if (filter.status && filter.status !== 'ALL') where.status = filter.status as CommissionStatus;
  return prisma.agentMarkupCommision.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { transaction: { select: { trxNumber: true, status: true } }, sourceAgent: { select: { name: true } } },
  });
}
