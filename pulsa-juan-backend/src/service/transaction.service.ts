import {
  collectedCustomerId,
  computeTotal,
  describeSteps,
  FlowStep,
  InquiryResult,
  normalizeIndonesianMobile,
  SegmentTree,
  walkPath,
} from 'pulsa-juan-common';
import { z } from 'zod';

import { Agent, Prisma, TransactionStatus } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, HttpError, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { getFulfillmentProvider } from './fulfillment';
import { packagesForTree } from './package.service';
import { getPrefixEntries } from './prefix.service';
import { resolveMarkup } from './referral.service';
import { creditSaldo, debitSaldo } from './saldo.service';

const stepSchema = z.object({ nodeId: z.string().min(1), type: z.string().min(1) }).passthrough();

export const createTransactionSchema = z.object({
  segmentId: z.string().min(1),
  treeVersion: z.number().int(),
  steps: z.array(stepSchema).min(1).max(20),
  clientTotal: z.number().int(),
  idempotencyKey: z.string().min(8).max(64),
});

export const inquirySchema = z.object({
  segmentId: z.string().min(1),
  nodeId: z.string().min(1),
  customerId: z.string().trim().min(1).max(40),
});

export const listSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  phone: z.string().trim().optional(),
  minAmount: z.coerce.number().int().optional(),
  maxAmount: z.coerce.number().int().optional(),
  status: z.string().optional(),
  sort: z.enum(['createdAt', 'total']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const adminUpdateSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'REFUNDED']),
  serialNumber: z.string().trim().max(120).optional(),
  failReason: z.string().trim().max(200).optional(),
  refundReason: z.string().trim().max(200).optional(),
});

export const adminListSchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  agentId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

async function loadPublished(segmentId: string) {
  const segment = await prisma.segment.findFirst({
    where: { OR: [{ id: segmentId }, { slug: segmentId }] },
    include: { publishedVersion: true },
  });
  if (!segment || !segment.isActive || !segment.publishedVersion) throw notFound('Layanan tidak ditemukan');
  if (segment.maintenanceMessage) throw badRequest(segment.maintenanceMessage, 'MAINTENANCE');
  return { segment, version: segment.publishedVersion, tree: segment.publishedVersion.tree as unknown as SegmentTree };
}

export async function inquire(agent: Agent, input: z.infer<typeof inquirySchema>): Promise<InquiryResult> {
  const { tree } = await loadPublished(input.segmentId);
  const node = tree.nodes[input.nodeId];
  if (!node || node.type !== 'BillInquiry') throw badRequest('Node cek tagihan tidak ditemukan');
  return getFulfillmentProvider().inquire(node.product, input.customerId);
}

export async function createTransaction(agent: Agent, input: z.infer<typeof createTransactionSchema>) {
  const existing = await prisma.transaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.agentId !== agent.id) throw conflict('Kunci transaksi sudah dipakai');
    return { transaction: existing, reused: true };
  }

  const { segment, version, tree } = await loadPublished(input.segmentId);
  if (version.version !== input.treeVersion) {
    throw conflict('Layanan sudah diperbarui, silakan ulangi', 'TREE_OUTDATED', { treeVersion: version.version });
  }

  const steps = input.steps as unknown as FlowStep[];
  const [packages, prefixes, markup] = await Promise.all([packagesForTree(tree), getPrefixEntries(), resolveMarkup(agent.id)]);
  const ctx = { packages, prefixes };

  const walk = walkPath(tree, steps, ctx);
  if (!walk.ok) throw badRequest(walk.error.message, walk.error.code, { nodeId: walk.error.nodeId });

  let inquiry: InquiryResult | null = null;
  const inquiryStep = steps.find((s) => s.type === 'BillInquiry');
  if (inquiryStep && inquiryStep.type === 'BillInquiry') {
    const node = tree.nodes[inquiryStep.nodeId];
    if (node.type !== 'BillInquiry') throw badRequest('Alur transaksi tidak valid');
    inquiry = await getFulfillmentProvider().inquire(node.product, inquiryStep.customerId);
  }

  const price = computeTotal(steps, tree, ctx, markup.markupTotal, inquiry);
  if (price.total !== input.clientTotal) {
    throw conflict('Harga berubah, silakan periksa kembali', 'PRICE_CHANGED', { total: price.total, breakdown: price });
  }
  const summary = describeSteps(steps, tree, ctx, inquiry);
  const phoneStep = [...steps].reverse().find((s) => s.type === 'PhoneNumberInput');
  const phoneNumber = phoneStep && phoneStep.type === 'PhoneNumberInput' ? normalizeIndonesianMobile(phoneStep.phoneNumber) : null;
  const customerId = collectedCustomerId(steps);
  const provider = getFulfillmentProvider();

  const transaction = await prisma.$transaction(async (tx) => {
    const trx = await tx.transaction.create({
      data: {
        agentId: agent.id,
        segmentId: segment.id,
        segmentLabel: segment.label,
        treeVersionId: version.id,
        packageId: price.packageId ?? null,
        steps: steps as unknown as Prisma.InputJsonValue,
        summary: summary as unknown as Prisma.InputJsonValue,
        phoneNumber,
        customerId,
        amountBase: price.amountBase,
        adminFee: price.adminFee,
        markupTotal: price.markupTotal,
        total: price.total,
        idempotencyKey: input.idempotencyKey,
        provider: provider.name,
        fulfillmentMode: provider.mode,
      },
    });
    await debitSaldo(tx, agent.id, price.total, 'PURCHASE', trx.id, `${segment.label} #${trx.trxNumber}`);
    const commissions = [
      markup.parent ? { beneficiaryCommisionId: markup.parent.commisionId, level: 1, amount: markup.parent.amount } : null,
      markup.grandparent ? { beneficiaryCommisionId: markup.grandparent.commisionId, level: 2, amount: markup.grandparent.amount } : null,
    ].filter((c): c is { beneficiaryCommisionId: string; level: number; amount: number } => !!c && c.amount > 0);
    if (commissions.length) {
      await tx.agentMarkupCommision.createMany({
        data: commissions.map((c) => ({ ...c, transactionId: trx.id, sourceAgentId: agent.id })),
      });
    }
    return trx;
  });

  // fulfilment (v1 manual → stays PENDING)
  try {
    const outcome = await provider.purchase({
      id: transaction.id,
      packageId: transaction.packageId,
      customerId,
      phoneNumber,
      total: transaction.total,
    });
    if (outcome.supplierRef) {
      await prisma.transaction.update({ where: { id: transaction.id }, data: { supplierRef: outcome.supplierRef } });
    }
    if (outcome.status !== 'PENDING') {
      const settled = await settleTransaction(transaction.id, outcome.status === 'SUCCESS'
        ? { status: 'SUCCESS', serialNumber: outcome.serialNumber }
        : { status: 'FAILED', failReason: outcome.reason }, null);
      return { transaction: settled, reused: false };
    }
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('fulfilment dispatch failed', error);
  }
  return { transaction, reused: false };
}

export type SettleInput =
  | { status: 'SUCCESS'; serialNumber?: string }
  | { status: 'FAILED'; failReason?: string }
  | { status: 'REFUNDED'; refundReason?: string };

/**
 * Status machine: PENDING → SUCCESS | FAILED, SUCCESS → REFUNDED, each exactly once.
 * FAILED and REFUNDED credit the saldo back and void unclaimed commissions.
 */
export async function settleTransaction(id: string, input: SettleInput, adminId: string | null) {
  if (input.status === 'REFUNDED') return refundTransaction(id, input.refundReason, adminId);
  const trx = await prisma.transaction.findUnique({ where: { id } });
  if (!trx) throw notFound('Transaksi tidak ditemukan');
  const settled = await prisma.$transaction(async (tx) => {
    const res = await tx.transaction.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: input.status,
        serialNumber: input.status === 'SUCCESS' ? input.serialNumber ?? null : null,
        failReason: input.status === 'FAILED' ? input.failReason ?? null : null,
        processedById: adminId,
        processedAt: new Date(),
      },
    });
    if (res.count === 0) throw conflict('Transaksi sudah diproses');
    if (input.status === 'FAILED') {
      await creditSaldo(tx, trx.agentId, trx.total, 'REFUND', id, `Refund ${trx.segmentLabel} #${trx.trxNumber}`);
      await tx.agentMarkupCommision.updateMany({ where: { transactionId: id, status: 'UNCLAIMED' }, data: { status: 'VOIDED' } });
    }
    return tx.transaction.findUniqueOrThrow({ where: { id } });
  });
  if (adminId) await audit(adminId, `TRANSACTION_${input.status}`, 'Transaction', id, input);
  return settled;
}

/**
 * SUCCESS → REFUNDED (delivered but disputed/reversed by the supplier). The
 * agent gets the full total back. Unclaimed commissions are voided; commissions
 * already claimed are clawed back from the beneficiary's saldo, and whatever the
 * saldo cannot cover is added to their hutang.
 */
async function refundTransaction(id: string, refundReason: string | undefined, adminId: string | null) {
  const trx = await prisma.transaction.findUnique({ where: { id } });
  if (!trx) throw notFound('Transaksi tidak ditemukan');
  const refunded = await prisma.$transaction(async (tx) => {
    const res = await tx.transaction.updateMany({
      where: { id, status: 'SUCCESS' },
      data: { status: 'REFUNDED', refundReason: refundReason ?? null, refundedAt: new Date(), processedById: adminId },
    });
    if (res.count === 0) throw conflict('Hanya transaksi sukses yang bisa direfund');
    await creditSaldo(tx, trx.agentId, trx.total, 'REFUND', id, `Refund ${trx.segmentLabel} #${trx.trxNumber}`);
    await tx.agentMarkupCommision.updateMany({ where: { transactionId: id, status: 'UNCLAIMED' }, data: { status: 'VOIDED' } });

    const claimed = await tx.agentMarkupCommision.findMany({ where: { transactionId: id, status: 'CLAIMED' } });
    for (const c of claimed) {
      const beneficiary = await tx.agent.findUnique({ where: { commisionUniqueId: c.beneficiaryCommisionId } });
      await tx.agentMarkupCommision.update({ where: { id: c.id }, data: { status: 'VOIDED' } });
      if (!beneficiary) continue;
      const fromSaldo = Math.min(c.amount, Math.floor(Number(beneficiary.saldo)));
      const note = `Tarik komisi refund #${trx.trxNumber}`;
      if (fromSaldo > 0) await debitSaldo(tx, beneficiary.id, fromSaldo, 'ADJUSTMENT', id, note);
      await tx.agent.update({
        where: { id: beneficiary.id },
        data: {
          saldoKomisi: { decrement: c.amount },
          ...(c.amount > fromSaldo ? { hutang: { increment: c.amount - fromSaldo } } : {}),
        },
      });
    }
    return tx.transaction.findUniqueOrThrow({ where: { id } });
  });
  if (adminId) await audit(adminId, 'TRANSACTION_REFUNDED', 'Transaction', id, { refundReason });
  return refunded;
}

function dayRange(from?: string, to?: string) {
  const gte = from ? new Date(from) : undefined;
  const lt = to ? new Date(new Date(to).getTime() + 24 * 3600 * 1000) : undefined;
  return { gte, lt };
}

export async function listForAgent(agentId: string, q: z.infer<typeof listSchema>) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  const where: Prisma.TransactionWhereInput = { agentId };
  const range = dayRange(q.from, q.to);
  if (range.gte || range.lt) where.createdAt = { gte: range.gte, lt: range.lt };
  if (q.phone) where.phoneNumber = { contains: normalizeIndonesianMobile(q.phone) || q.phone };
  if (q.minAmount !== undefined || q.maxAmount !== undefined) where.total = { gte: q.minAmount, lte: q.maxAmount };
  if (q.status && q.status !== 'ALL') where.status = q.status as TransactionStatus;
  const orderBy = { [q.sort ?? 'createdAt']: q.dir ?? 'desc' } as Prisma.TransactionOrderByWithRelationInput;
  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { segment: { select: { slug: true, iconUrl: true } } } }),
  ]);
  return { total, page, pageSize, transactions };
}

export async function getForAgent(agentId: string, id: string) {
  const trx = await prisma.transaction.findFirst({ where: { id, agentId }, include: { segment: { select: { slug: true, iconUrl: true } } } });
  if (!trx) throw notFound('Transaksi tidak ditemukan');
  return trx;
}

/** Spending recap: PENDING + SUCCESS count as spent (FAILED was refunded). */
export async function rekap(agentId: string, from?: string, to?: string) {
  const range = dayRange(from, to);
  const rows = await prisma.transaction.findMany({
    where: { agentId, status: { in: ['PENDING', 'SUCCESS'] }, createdAt: { gte: range.gte, lt: range.lt } },
    select: { total: true, createdAt: true, segmentLabel: true, status: true },
  });
  const byDay: Record<string, { date: string; totalSpent: number; count: number }> = {};
  const bySegment: Record<string, { segmentLabel: string; totalSpent: number; count: number }> = {};
  let totalSpent = 0;
  for (const r of rows) {
    // Asia/Jakarta day bucket (UTC+7)
    const date = new Date(r.createdAt.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    totalSpent += r.total;
    byDay[date] = byDay[date] ?? { date, totalSpent: 0, count: 0 };
    byDay[date].totalSpent += r.total;
    byDay[date].count++;
    bySegment[r.segmentLabel] = bySegment[r.segmentLabel] ?? { segmentLabel: r.segmentLabel, totalSpent: 0, count: 0 };
    bySegment[r.segmentLabel].totalSpent += r.total;
    bySegment[r.segmentLabel].count++;
  }
  return {
    totalSpent,
    count: rows.length,
    byDay: Object.values(byDay).sort((a, b) => (a.date < b.date ? 1 : -1)),
    bySegment: Object.values(bySegment).sort((a, b) => b.totalSpent - a.totalSpent),
  };
}

/** Admin order log: newest first, all statuses unless filtered. */
export async function adminList(q: z.infer<typeof adminListSchema>) {
  const page = q.page ?? 1;
  const pageSize = Math.min(q.pageSize ?? 50, 200);
  const where: Prisma.TransactionWhereInput = {};
  if (q.status && q.status !== 'ALL') where.status = q.status as TransactionStatus;
  if (q.agentId) where.agentId = q.agentId;
  if (q.search) {
    const n = Number(q.search);
    where.OR = [
      { phoneNumber: { contains: q.search } },
      { customerId: { contains: q.search } },
      { agent: { name: { contains: q.search, mode: 'insensitive' } } },
      { agent: { phone: { contains: q.search } } },
      { serialNumber: { contains: q.search } },
      ...(Number.isInteger(n) && n > 0 && n < 2 ** 31 ? [{ trxNumber: n }] : []),
    ];
  }
  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { agent: { select: { id: true, name: true, phone: true } }, package: { select: { code: true, name: true, supplierSku: true } } },
    }),
  ]);
  return { total, page, pageSize, transactions };
}
