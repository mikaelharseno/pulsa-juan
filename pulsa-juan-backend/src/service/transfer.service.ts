import { normalizeIndonesianMobile } from 'pulsa-juan-common';
import { z } from 'zod';

import { Agent, Prisma, SaldoTransfer, TransferStatus } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, notFound } from '../lib/errors';
import { verifyAgentPin } from './agentAuth.service';
import { audit } from './audit.service';
import { assertSaldoUsable, creditSaldo, debitSaldo } from './saldo.service';

// Saldo transfers between agents. Agents send from the app (done at once, PIN
// checked); admins draft a transfer that an OWNER approves (executed then) or
// rejects. An OWNER can reverse a DONE transfer: the recipient gives the amount
// back, and whatever its saldo cannot cover becomes hutang (like a refund clawback).

type Tx = Prisma.TransactionClient;

export const TRANSFER_MIN = 1000;
export const TRANSFER_MAX = 10_000_000;
const amountSchema = z.number().int().min(TRANSFER_MIN, `Minimal Rp ${TRANSFER_MIN.toLocaleString('id-ID')}`).max(TRANSFER_MAX);

/** a phone number or a referral code */
export const lookupSchema = z.object({ to: z.string().trim().min(3).max(30) });
export const agentTransferSchema = z.object({
  to: z.string().trim().min(3).max(30),
  amount: amountSchema,
  note: z.string().trim().max(120).optional(),
  pin: z.string().optional(),
  idempotencyKey: z.string().min(8).max(100),
});
export const draftSchema = z.object({
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  amount: amountSchema,
  note: z.string().trim().min(1).max(200),
});
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });

const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}****${p.slice(-3)}` : p);

async function findRecipient(to: string) {
  const raw = to.trim();
  const byCode = /[A-Za-z]/.test(raw);
  const agent = byCode
    ? await prisma.agent.findUnique({ where: { commisionUniqueId: raw.toUpperCase() } })
    : await prisma.agent.findUnique({ where: { phone: normalizeIndonesianMobile(raw) } });
  if (!agent || agent.status !== 'ACTIVE') throw notFound('Agen tujuan tidak ditemukan');
  return agent;
}

/** Recipient preview before sending (name + masked phone, never the saldo). */
export async function lookupRecipient(sender: Agent, to: string) {
  const r = await findRecipient(to);
  if (r.id === sender.id) throw badRequest('Tidak bisa transfer ke akun sendiri', 'TRANSFER_SELF');
  return { name: r.name, phone: maskPhone(r.phone), code: r.commisionUniqueId };
}

async function move(tx: Tx, t: SaldoTransfer, fromName: string, toName: string) {
  await debitSaldo(tx, t.fromAgentId, t.amount, 'TRANSFER', t.id, `Transfer #${t.number} ke ${toName}`);
  await creditSaldo(tx, t.toAgentId, t.amount, 'TRANSFER', t.id, `Transfer #${t.number} dari ${fromName}`);
}

/** Agent → agent from the app: immediate. Replays with the same key return the first transfer. */
export async function sendTransfer(sender: Agent, input: z.infer<typeof agentTransferSchema>) {
  const existing = await prisma.saldoTransfer.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.fromAgentId !== sender.id) throw conflict('Kunci transfer sudah dipakai');
    return { transfer: existing, reused: true };
  }
  assertSaldoUsable(sender);
  await verifyAgentPin(sender.id, input.pin);
  const to = await findRecipient(input.to);
  if (to.id === sender.id) throw badRequest('Tidak bisa transfer ke akun sendiri', 'TRANSFER_SELF');
  const transfer = await prisma.$transaction(async (tx) => {
    const t = await tx.saldoTransfer.create({
      data: { fromAgentId: sender.id, toAgentId: to.id, amount: input.amount, note: input.note || null, source: 'AGENT', status: 'DONE', idempotencyKey: input.idempotencyKey },
    });
    await move(tx, t, sender.name, to.name);
    return t;
  });
  const saldo = await prisma.agent.findUniqueOrThrow({ where: { id: sender.id }, select: { saldo: true } });
  return { transfer, reused: false, recipient: { name: to.name }, saldo: Number(saldo.saldo) };
}

const withAgents = { fromAgent: { select: { id: true, name: true, phone: true } }, toAgent: { select: { id: true, name: true, phone: true } } } as const;

export async function listTransfers(q: { status?: string; agentId?: string }) {
  const where: Prisma.SaldoTransferWhereInput = {};
  if (q.status && q.status !== 'ALL') where.status = q.status as TransferStatus;
  if (q.agentId) where.OR = [{ fromAgentId: q.agentId }, { toAgentId: q.agentId }];
  return prisma.saldoTransfer.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, include: withAgents });
}

export async function createDraft(adminId: string, input: z.infer<typeof draftSchema>) {
  if (input.fromAgentId === input.toAgentId) throw badRequest('Agen asal dan tujuan sama');
  const [from, to] = await Promise.all([
    prisma.agent.findUnique({ where: { id: input.fromAgentId } }),
    prisma.agent.findUnique({ where: { id: input.toAgentId } }),
  ]);
  if (!from || !to) throw notFound('Agen tidak ditemukan');
  const t = await prisma.saldoTransfer.create({
    data: { ...input, source: 'ADMIN', status: 'DRAFT', createdByAdminId: adminId },
    include: withAgents,
  });
  await audit(adminId, 'TRANSFER_DRAFT', 'SaldoTransfer', t.id, input);
  return t;
}

/** OWNER: executes a draft. A frozen sender does not block an admin-approved transfer. */
export async function approveDraft(adminId: string, id: string) {
  const t = await prisma.saldoTransfer.findUnique({ where: { id }, include: withAgents });
  if (!t) throw notFound('Transfer tidak ditemukan');
  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.saldoTransfer.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'DONE', approvedById: adminId, approvedAt: new Date() },
    });
    if (res.count === 0) throw conflict('Transfer sudah diproses');
    try {
      await move(tx, t, t.fromAgent.name, t.toAgent.name);
    } catch (e) {
      throw (e as { code?: string }).code === 'SALDO_KURANG' ? badRequest(`Saldo ${t.fromAgent.name} tidak cukup`, 'SALDO_KURANG') : e;
    }
    return tx.saldoTransfer.findUniqueOrThrow({ where: { id }, include: withAgents });
  });
  await audit(adminId, 'TRANSFER_APPROVE', 'SaldoTransfer', id, { amount: t.amount });
  return done;
}

export async function rejectDraft(adminId: string, id: string, reason: string) {
  const res = await prisma.saldoTransfer.updateMany({
    where: { id, status: 'DRAFT' },
    data: { status: 'REJECTED', approvedById: adminId, approvedAt: new Date(), rejectReason: reason },
  });
  if (res.count === 0) throw conflict('Transfer sudah diproses');
  await audit(adminId, 'TRANSFER_REJECT', 'SaldoTransfer', id, { reason });
  return prisma.saldoTransfer.findUniqueOrThrow({ where: { id }, include: withAgents });
}

/** OWNER: DONE → REVERSED. Sender gets the amount back; the recipient's shortfall becomes hutang. */
export async function reverseTransfer(adminId: string, id: string, reason: string) {
  const t = await prisma.saldoTransfer.findUnique({ where: { id }, include: withAgents });
  if (!t) throw notFound('Transfer tidak ditemukan');
  const reversed = await prisma.$transaction(async (tx) => {
    const res = await tx.saldoTransfer.updateMany({
      where: { id, status: 'DONE' },
      data: { status: 'REVERSED', reversedById: adminId, reversedAt: new Date(), reverseReason: reason },
    });
    if (res.count === 0) throw conflict('Hanya transfer yang sudah selesai yang bisa dibatalkan');
    const recipient = await tx.agent.findUniqueOrThrow({ where: { id: t.toAgentId }, select: { saldo: true } });
    const fromSaldo = Math.min(t.amount, Math.floor(Number(recipient.saldo)));
    const note = `Pembatalan transfer #${t.number}`;
    if (fromSaldo > 0) await debitSaldo(tx, t.toAgentId, fromSaldo, 'TRANSFER', t.id, `${note} (ke ${t.fromAgent.name})`);
    if (t.amount > fromSaldo) await tx.agent.update({ where: { id: t.toAgentId }, data: { hutang: { increment: t.amount - fromSaldo } } });
    await creditSaldo(tx, t.fromAgentId, t.amount, 'TRANSFER', t.id, `${note} (dari ${t.toAgent.name})`);
    return tx.saldoTransfer.findUniqueOrThrow({ where: { id }, include: withAgents });
  });
  await audit(adminId, 'TRANSFER_REVERSE', 'SaldoTransfer', id, { reason, amount: t.amount });
  return reversed;
}
