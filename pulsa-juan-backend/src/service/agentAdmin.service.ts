import { isValidNik } from 'pulsa-juan-common';
import { z } from 'zod';

import { AgentStatus, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { creditSaldo, debitSaldo } from './saldo.service';

export const agentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  nik: z.string().trim().refine(isValidNik, 'NIK harus 16 angka').nullable().optional(),
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
      { nik: { contains: q.search } },
      { commisionUniqueId: { contains: q.search.toUpperCase() } },
    ];
  }
  return prisma.agent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true, name: true, email: true, phone: true, nik: true, status: true, saldo: true, hutang: true, poin: true,
      commisionUniqueId: true, saldoKomisi: true, referralMarkup: true, referrerMarkup: true, joinedAt: true, createdAt: true, googleSub: true,
      referrer: { select: { id: true, name: true } },
    },
  });
}

/** Everything stored about an agent except secrets (hashes / OTP codes). */
export async function getAgentDetail(id: string) {
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { referrer: { select: { id: true, name: true, commisionUniqueId: true } } },
  });
  if (!agent) throw notFound('Agen tidak ditemukan');
  const [children, ledger, unclaimed, transactionCount, topUpCount] = await Promise.all([
    prisma.agent.findMany({
      where: { referrerAgentId: id },
      orderBy: { joinedAt: 'desc' },
      select: { id: true, name: true, commisionUniqueId: true, referrerMarkup: true, joinedAt: true },
    }),
    prisma.saldoLedger.findMany({ where: { agentId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.agentMarkupCommision.aggregate({ where: { beneficiaryCommisionId: agent.commisionUniqueId, status: 'UNCLAIMED' }, _sum: { amount: true } }),
    prisma.transaction.count({ where: { agentId: id } }),
    prisma.topUpOrder.count({ where: { agentId: id } }),
  ]);
  const {
    passwordHash: _p,
    pinHash: _pin,
    confirmationCode: _c,
    confirmationCodeAttempts: _ca,
    referrer,
    ...safe
  } = agent;
  return {
    ...safe,
    hasPassword: !!agent.passwordHash,
    hasPin: !!agent.pinHash,
    otpPending: !!agent.confirmationCode && !!agent.confirmationCodeExpiresAt && agent.confirmationCodeExpiresAt > new Date(),
    upline: referrer ? { commisionAmount: agent.referrerMarkup, agent: referrer } : null,
    downline: children.map((c) => ({
      id: c.id,
      commisionAmount: c.referrerMarkup,
      createdAt: c.joinedAt,
      agent: { id: c.id, name: c.name, commisionUniqueId: c.commisionUniqueId },
    })),
    ledger,
    unclaimedCommission: unclaimed._sum.amount ?? 0,
    transactionCount,
    topUpCount,
  };
}

export async function updateAgent(adminId: string, id: string, input: z.infer<typeof agentUpdateSchema>) {
  if (input.nik) {
    const taken = await prisma.agent.findUnique({ where: { nik: input.nik }, select: { id: true } });
    if (taken && taken.id !== id) throw conflict('NIK sudah terdaftar');
  }
  await prisma.agent.update({ where: { id }, data: input });
  await audit(adminId, 'AGENT_UPDATE', 'Agent', id, input);
  return getAgentDetail(id);
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
