import { formatRp, kodeUnikBase, nextKodeUnik, toInternationalMobile } from 'pulsa-juan-common';
import { z } from 'zod';

import { Agent, AdminRole, BankCode, TopUpStatus } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { bankAccounts, getConfig } from './config.service';
import { creditSaldo } from './saldo.service';

export const createTopUpSchema = z.object({ amount: z.number().int() });
export const selectBankSchema = z.object({ bank: z.enum(['BRI', 'BCA']) });
export const adminTopUpUpdateSchema = z.object({
  status: z.enum(['PAID', 'REJECTED']),
  reason: z.string().trim().max(200).optional(),
  credit: z.boolean().optional(),
});
export const hutangPaymentSchema = z.object({ amount: z.number().int().min(1) });

const OPEN: TopUpStatus[] = ['PENDING', 'CLAIMED'];

export async function createTopUp(agent: Agent, amount: number) {
  const config = await getConfig();
  if (amount < config.topUpMin) throw badRequest(`Top up minimal ${formatRp(config.topUpMin)}`);
  if (amount > config.topUpMax) throw badRequest(`Top up maksimal ${formatRp(config.topUpMax)}`);
  const expiresAt = new Date(Date.now() + config.topUpExpiryHours * 3600 * 1000);

  return prisma.$transaction(async (tx) => {
    const created = await tx.topUpOrder.create({
      data: { agentId: agent.id, amount, kodeUnik: 0, totalTransfer: 0, expiresAt },
    });
    // kode unik: derived from the order number, then probed forward until the
    // resulting total is unique among open top-ups.
    let code = kodeUnikBase(created.orderNumber);
    for (let i = 0; i < 900; i++) {
      const clash = await tx.topUpOrder.findFirst({
        where: { id: { not: created.id }, status: { in: OPEN }, expiresAt: { gt: new Date() }, totalTransfer: amount + code },
        select: { id: true },
      });
      if (!clash) break;
      code = nextKodeUnik(code);
    }
    return tx.topUpOrder.update({
      where: { id: created.id },
      data: { kodeUnik: code, totalTransfer: amount + code },
    });
  });
}

async function ownTopUp(agentId: string, id: string) {
  const order = await prisma.topUpOrder.findFirst({ where: { id, agentId } });
  if (!order) throw notFound('Top up tidak ditemukan');
  return order;
}

export async function withBankDetails<T extends { bank: BankCode | null }>(order: T) {
  const config = await getConfig();
  const account = bankAccounts(config).find((a) => a.bank === order.bank) ?? null;
  return { ...order, account };
}

export async function selectBank(agentId: string, id: string, bank: BankCode) {
  const order = await ownTopUp(agentId, id);
  if (!OPEN.includes(order.status)) throw badRequest('Top up sudah tidak bisa diubah');
  const config = await getConfig();
  if (!bankAccounts(config).some((a) => a.bank === bank)) throw badRequest('Rekening bank belum tersedia');
  const updated = await prisma.topUpOrder.update({ where: { id }, data: { bank } });
  return withBankDetails(updated);
}

/** "Saya sudah bayar": marks CLAIMED and returns the wa.me hand-off. */
export async function claimTopUp(agent: Agent, id: string) {
  const order = await ownTopUp(agent.id, id);
  if (!OPEN.includes(order.status)) throw badRequest('Top up sudah diproses');
  if (!order.bank) throw badRequest('Pilih bank terlebih dahulu');
  const updated = await prisma.topUpOrder.update({
    where: { id },
    data: { status: 'CLAIMED', claimedAt: order.claimedAt ?? new Date() },
  });
  const config = await getConfig();
  const waNumber = toInternationalMobile(config.csWhatsapp);
  const waText =
    `Permisi kak, saya baru transfer sebesar ${formatRp(Number(updated.totalTransfer))} via Bank ${updated.bank}` +
    ` untuk top up saldo #${updated.orderNumber} a.n. ${agent.name}`;
  const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}` : null;
  return { ...(await withBankDetails(updated)), waText, waUrl };
}

export async function listTopUps(agentId: string) {
  return prisma.topUpOrder.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, take: 100 });
}

export async function adminListTopUps(status?: string) {
  const where = status && status !== 'ALL' ? { status: status as TopUpStatus } : { status: { in: OPEN } };
  return prisma.topUpOrder.findMany({
    where,
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    take: 300,
    include: { agent: { select: { id: true, name: true, phone: true, email: true } } },
  });
}

export interface ConfirmInput {
  status: 'PAID' | 'REJECTED';
  reason?: string;
  credit?: boolean;
  proofImageUrl?: string | null;
}

export async function adminUpdateTopUp(admin: { adminId: string; role: AdminRole }, id: string, input: ConfirmInput) {
  const order = await prisma.topUpOrder.findUnique({ where: { id } });
  if (!order) throw notFound('Top up tidak ditemukan');

  if (input.status === 'REJECTED') {
    const res = await prisma.topUpOrder.updateMany({
      where: { id, status: { in: OPEN } },
      data: { status: 'REJECTED', rejectReason: input.reason ?? null, confirmedById: admin.adminId },
    });
    if (res.count === 0) throw conflict('Top up sudah diproses');
    await audit(admin.adminId, 'TOPUP_REJECT', 'TopUpOrder', id, { reason: input.reason });
    return prisma.topUpOrder.findUniqueOrThrow({ where: { id } });
  }

  const credit = !!input.credit;
  if (credit && admin.role !== 'OWNER') throw forbidden('Konfirmasi kredit (hutang) hanya untuk OWNER');
  if (!credit && !input.proofImageUrl) throw badRequest('Bukti mutasi bank wajib diunggah', 'PROOF_REQUIRED');

  const amount = Number(order.amount);
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.topUpOrder.updateMany({
      where: { id, status: { in: OPEN } },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        confirmedById: admin.adminId,
        proofImageUrl: input.proofImageUrl ?? null,
        isCredit: credit,
      },
    });
    if (res.count === 0) throw conflict('Top up sudah diproses');
    await creditSaldo(tx, order.agentId, amount, 'TOPUP', id, credit ? `Top up kredit (hutang) #${order.orderNumber}` : `Top up #${order.orderNumber}`);
    if (credit) await tx.agent.update({ where: { id: order.agentId }, data: { hutang: { increment: amount } } });
    return tx.topUpOrder.findUniqueOrThrow({ where: { id } });
  });
  await audit(admin.adminId, credit ? 'TOPUP_CONFIRM_CREDIT' : 'TOPUP_CONFIRM', 'TopUpOrder', id, { amount, proofImageUrl: input.proofImageUrl });
  return updated;
}

export async function hutangPayment(adminId: string, agentId: string, amount: number, proofImageUrl?: string | null) {
  const res = await prisma.agent.updateMany({
    where: { id: agentId, hutang: { gte: amount } },
    data: { hutang: { decrement: amount } },
  });
  if (res.count === 0) throw badRequest('Nominal melebihi hutang agen');
  await audit(adminId, 'HUTANG_PAYMENT', 'Agent', agentId, { amount, proofImageUrl });
  return prisma.agent.findUniqueOrThrow({ where: { id: agentId }, select: { id: true, hutang: true } });
}

/** Cron: PENDING top-ups past expiry become EXPIRED (CLAIMED ones wait for the admin). */
export async function expireStaleTopUps() {
  const res = await prisma.topUpOrder.updateMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  if (res.count) console.log(`expired ${res.count} stale top-ups`);
  return res.count;
}
