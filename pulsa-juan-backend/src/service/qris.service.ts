import { QRIS_MONTHLY_LIMIT } from 'pulsa-juan-common';
import { z } from 'zod';

import { Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { notFound } from '../lib/errors';
import { audit } from './audit.service';

// Static QRIS codes for saldo top-ups. A static QRIS carries no amount, so the
// agent types the exact total (kode unik included). Each one may take at most
// monthlyLimit a month; a new QRIS top-up goes to the code with the least use.

export const qrisSchema = z.object({
  label: z.string().trim().min(1).max(60),
  imageUrl: z.string().trim().min(1).max(500),
  monthlyLimit: z.number().int().min(100_000).max(1_000_000_000).default(QRIS_MONTHLY_LIMIT),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export const qrisUpdateSchema = qrisSchema.partial();

type Db = Prisma.TransactionClient | typeof prisma;

/** Start of the current calendar month in Asia/Jakarta (UTC+7), as a UTC instant. */
export function jakartaMonthStart(now = new Date()) {
  const wib = new Date(now.getTime() + 7 * 3600 * 1000);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - 7 * 3600 * 1000);
}

/**
 * Use this month per QRIS code: PAID this month, plus open (PENDING/CLAIMED,
 * not expired) orders already assigned to it, so two agents paying at once
 * cannot push one code over its limit. `exceptOrderId` leaves out the order
 * being (re)assigned.
 */
export async function qrisUsage(db: Db, exceptOrderId?: string, now = new Date()) {
  const monthStart = jakartaMonthStart(now);
  const not = exceptOrderId ? { id: { not: exceptOrderId } } : {};
  const [paid, open] = await Promise.all([
    db.topUpOrder.groupBy({ by: ['qrisCodeId'], where: { ...not, bank: 'QRIS', status: 'PAID', paidAt: { gte: monthStart } }, _sum: { totalTransfer: true } }),
    db.topUpOrder.groupBy({ by: ['qrisCodeId'], where: { ...not, bank: 'QRIS', status: { in: ['PENDING', 'CLAIMED'] }, expiresAt: { gt: now } }, _sum: { totalTransfer: true } }),
  ]);
  const usage = new Map<string, { paid: number; reserved: number }>();
  for (const r of paid) if (r.qrisCodeId) usage.set(r.qrisCodeId, { paid: Number(r._sum.totalTransfer ?? 0), reserved: 0 });
  for (const r of open) {
    if (!r.qrisCodeId) continue;
    const u = usage.get(r.qrisCodeId) ?? { paid: 0, reserved: 0 };
    u.reserved = Number(r._sum.totalTransfer ?? 0);
    usage.set(r.qrisCodeId, u);
  }
  return usage;
}

/** The active code with the least use that still fits `total`, or null. */
export async function pickQrisCode(db: Db, total: number, exceptOrderId?: string) {
  const codes = await db.qrisCode.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  if (!codes.length) return null;
  const usage = await qrisUsage(db, exceptOrderId);
  const ranked = codes
    .map((c) => {
      const u = usage.get(c.id) ?? { paid: 0, reserved: 0 };
      return { code: c, used: u.paid + u.reserved };
    })
    .filter((x) => x.used + total <= x.code.monthlyLimit)
    .sort((a, b) => a.used - b.used || a.code.sortOrder - b.code.sortOrder);
  return ranked[0]?.code ?? null;
}

/** Whether any active QRIS code exists (the app shows the option then). */
export async function qrisEnabled() {
  return (await prisma.qrisCode.count({ where: { isActive: true } })) > 0;
}

export async function adminListQris() {
  const [codes, usage] = await Promise.all([prisma.qrisCode.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }), qrisUsage(prisma)]);
  return codes.map((c) => ({ ...c, paidThisMonth: usage.get(c.id)?.paid ?? 0, reservedNow: usage.get(c.id)?.reserved ?? 0 }));
}

export async function adminCreateQris(adminId: string, input: z.infer<typeof qrisSchema>) {
  const code = await prisma.qrisCode.create({ data: input });
  await audit(adminId, 'QRIS_CREATE', 'QrisCode', code.id, input);
  return code;
}

export async function adminUpdateQris(adminId: string, id: string, input: z.infer<typeof qrisUpdateSchema>) {
  if (!(await prisma.qrisCode.findUnique({ where: { id } }))) throw notFound('QRIS tidak ditemukan');
  const code = await prisma.qrisCode.update({ where: { id }, data: input });
  await audit(adminId, 'QRIS_UPDATE', 'QrisCode', id, input);
  return code;
}

/** Deletes an unused code; one with top-ups is only switched off (history keeps its label). */
export async function adminDeleteQris(adminId: string, id: string) {
  const code = await prisma.qrisCode.findUnique({ where: { id }, include: { _count: { select: { topUps: true } } } });
  if (!code) throw notFound('QRIS tidak ditemukan');
  if (code._count.topUps > 0) {
    await prisma.qrisCode.update({ where: { id }, data: { isActive: false } });
    await audit(adminId, 'QRIS_DEACTIVATE', 'QrisCode', id);
    return { deleted: false, deactivated: true };
  }
  await prisma.qrisCode.delete({ where: { id } });
  await audit(adminId, 'QRIS_DELETE', 'QrisCode', id);
  return { deleted: true, deactivated: false };
}
