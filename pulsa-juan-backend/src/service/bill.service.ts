import { InquiryResult, parseBillMessage } from 'pulsa-juan-common';
import { z } from 'zod';

import { BillCheck, Biller, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, notFound, tooManyRequests } from '../lib/errors';
import { audit } from './audit.service';
import { otomaxEnabled } from './fulfillment';
import { checkRefPrefix, otomaxRequest } from './fulfillment/otomax';

// Postpaid bills (PLN pascabayar, Telkom, …) through OtomaX: a check (Biller.checkCode,
// dest = customer id) returns the bill as free text, read with the biller's patterns.
// The reply may carry the bill right away or later through the report URL, so a check
// is a row the app polls. Paying uses the stored check (see createTransaction).

const CHECKS_PER_MINUTE = 5;
const REUSE_MS = 2 * 60_000;

const optionalRe = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => {
      if (!v) return true;
      try {
        new RegExp(v, 'i');
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Pola regex tidak valid' },
  );

export const billerSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,40}$/, 'Kunci: huruf besar, angka, garis bawah'),
  name: z.string().trim().min(1).max(80),
  checkCode: z.string().trim().max(40).default(''),
  payCode: z.string().trim().max(40).default(''),
  ourFee: z.number().int().min(0).max(100_000).default(0),
  nameRe: optionalRe,
  amountRe: optionalRe,
  adminRe: optionalRe,
  totalRe: optionalRe,
  periodeRe: optionalRe,
  notPayableRe: optionalRe,
  failRe: optionalRe,
  validityMinutes: z.number().int().min(1).max(24 * 60).default(30),
  isActive: z.boolean().default(false),
});

export const checkInputSchema = z.object({ customerId: z.string().trim().min(1).max(40) });

/** A biller the app can check and pay right now. */
export function billerUsable(b: Biller | null): b is Biller {
  return !!b && b.isActive && !!b.checkCode && !!b.payCode && otomaxEnabled();
}

export async function listBillers() {
  const billers = await prisma.biller.findMany({ orderBy: { name: 'asc' } });
  const last = await Promise.all(
    billers.map((b) => prisma.billCheck.findFirst({ where: { billerId: b.id }, orderBy: { createdAt: 'desc' } })),
  );
  return billers.map((b, i) => ({ ...b, usable: billerUsable(b), lastCheck: last[i] }));
}

export async function createBiller(adminId: string, input: z.infer<typeof billerSchema>) {
  if (await prisma.biller.findUnique({ where: { key: input.key } })) throw conflict('Kunci biller sudah dipakai');
  const biller = await prisma.biller.create({ data: input });
  await audit(adminId, 'BILLER_CREATE', 'Biller', biller.id, input);
  return biller;
}

export async function updateBiller(adminId: string, id: string, input: z.infer<typeof billerSchema>) {
  const existing = await prisma.biller.findUnique({ where: { id } });
  if (!existing) throw notFound('Biller tidak ditemukan');
  if (input.key !== existing.key && (await prisma.biller.findUnique({ where: { key: input.key } }))) {
    throw conflict('Kunci biller sudah dipakai');
  }
  if (input.isActive && (!input.checkCode || !input.payCode)) throw badRequest('Isi kode cek dan kode bayar sebelum mengaktifkan');
  const biller = await prisma.biller.update({ where: { id }, data: input });
  await audit(adminId, 'BILLER_UPDATE', 'Biller', id, input);
  return biller;
}

/** Records a check reply/report; only a PENDING check changes (a late duplicate report is a no-op). */
export async function applyCheckMessage(check: BillCheck & { biller: Biller }, message: string) {
  const parsed = parseBillMessage(check.biller, message);
  const data: Prisma.BillCheckUpdateManyMutationInput = { rawMessage: message.slice(0, 1000) };
  if (parsed.status === 'READY') {
    Object.assign(data, {
      status: 'READY',
      amountDue: parsed.amountDue,
      supplierAdmin: parsed.supplierAdmin,
      customerName: parsed.customerName?.slice(0, 120) ?? null,
      periode: parsed.periode?.slice(0, 80) ?? null,
      expiresAt: new Date(Date.now() + check.biller.validityMinutes * 60_000),
    });
  } else if (parsed.status !== 'PENDING') {
    data.status = parsed.status;
  }
  await prisma.billCheck.updateMany({ where: { id: check.id, status: 'PENDING' }, data });
  return prisma.billCheck.findUniqueOrThrow({ where: { id: check.id }, include: { biller: true } });
}

/** Sends the check to OtomaX; a network error marks it FAILED (nothing was charged). */
async function dispatchCheck(check: BillCheck & { biller: Biller }) {
  try {
    const message = await otomaxRequest(check.biller.checkCode, check.customerId, `${checkRefPrefix()}${check.number}`);
    return await applyCheckMessage(check, message);
  } catch (error) {
    const message = `Tidak terkirim: ${(error as Error).message ?? String(error)}`;
    console.error(`bill check C${check.number} failed`, message);
    await prisma.billCheck.updateMany({ where: { id: check.id, status: 'PENDING' }, data: { status: 'FAILED', rawMessage: message.slice(0, 1000) } });
    return prisma.billCheck.findUniqueOrThrow({ where: { id: check.id }, include: { biller: true } });
  }
}

/** READY checks past their validity turn EXPIRED when read. */
async function refreshExpiry<T extends BillCheck>(check: T): Promise<T> {
  if (check.status === 'READY' && check.expiresAt && check.expiresAt.getTime() <= Date.now()) {
    await prisma.billCheck.updateMany({ where: { id: check.id, status: 'READY' }, data: { status: 'EXPIRED' } });
    return { ...check, status: 'EXPIRED' };
  }
  return check;
}

const STATUS_MESSAGE: Record<string, string> = {
  PENDING: 'Mengecek tagihan…',
  NOT_PAYABLE: 'Tagihan sudah lunas atau belum ada tagihan',
  FAILED: 'Cek tagihan gagal. Periksa ID pelanggan lalu coba lagi.',
  USED: 'Tagihan ini sudah diproses',
  EXPIRED: 'Data tagihan kedaluwarsa, silakan cek ulang',
};

export function checkResult(check: BillCheck): InquiryResult {
  return {
    checkId: check.id,
    customerId: check.customerId,
    customerName: check.customerName ?? undefined,
    periode: check.periode ?? undefined,
    amountDue: check.amountDue,
    adminFee: check.supplierAdmin + check.ourFee,
  };
}

/** What the agent app sees: never the raw supplier text (it can carry our center balance). */
export function checkView(check: BillCheck) {
  const result = check.status === 'READY' ? checkResult(check) : undefined;
  // result fields also sit at the top level, where app 1.0.0 reads them
  return {
    checkId: check.id,
    status: check.status,
    ...(result ? { ...result, result, expiresAt: check.expiresAt } : { message: STATUS_MESSAGE[check.status] }),
  };
}

export async function startAgentCheck(agentId: string, biller: Biller, customerId: string) {
  const since = new Date(Date.now() - 60_000);
  const recent = await prisma.billCheck.count({ where: { agentId, createdAt: { gte: since } } });
  const reusable = await prisma.billCheck.findFirst({
    where: {
      agentId,
      billerId: biller.id,
      customerId,
      status: 'READY',
      createdAt: { gte: new Date(Date.now() - REUSE_MS) },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (reusable) return reusable;
  if (recent >= CHECKS_PER_MINUTE) throw tooManyRequests('Terlalu banyak cek tagihan. Tunggu sebentar lalu coba lagi.', 'CHECK_RATE_LIMIT');
  const check = await prisma.billCheck.create({
    data: { agentId, billerId: biller.id, customerId, ourFee: biller.ourFee },
    include: { biller: true },
  });
  return dispatchCheck(check);
}

export async function getAgentCheck(agentId: string, id: string) {
  const check = await prisma.billCheck.findFirst({ where: { id, agentId } });
  if (!check) throw notFound('Cek tagihan tidak ditemukan');
  return refreshExpiry(check);
}

/** Dashboard "Cek tagihan nyata": a real check with no order; shows the raw reply. */
export async function adminCheck(adminId: string, billerId: string, customerId: string) {
  const biller = await prisma.biller.findUnique({ where: { id: billerId } });
  if (!biller) throw notFound('Biller tidak ditemukan');
  if (!biller.checkCode) throw badRequest('Kode cek belum diisi');
  if (!otomaxEnabled()) throw badRequest('OtomaX belum dikonfigurasi di server');
  const check = await prisma.billCheck.create({
    data: { adminId, billerId: biller.id, customerId, ourFee: biller.ourFee },
    include: { biller: true },
  });
  await audit(adminId, 'BILLER_TEST_CHECK', 'Biller', biller.id, { customerId });
  return dispatchCheck(check);
}

export async function adminGetCheck(id: string) {
  const check = await prisma.billCheck.findUnique({ where: { id }, include: { biller: { select: { key: true, name: true } } } });
  if (!check) throw notFound('Cek tagihan tidak ditemukan');
  return refreshExpiry(check);
}

/** OtomaX report for a check refID (prefix + number). Returns false when unknown. */
export async function reportCheck(number: number, message: string) {
  const check = await prisma.billCheck.findUnique({ where: { number }, include: { biller: true } });
  if (!check) return false;
  await applyCheckMessage(check, message);
  return true;
}

/**
 * Loads the check a bill payment uses. It must belong to the agent and the
 * customer id on the path, be READY and not expired; it becomes USED inside the
 * purchase's DB transaction (claimCheck).
 */
export async function payableCheck(agentId: string, checkId: string, billerKey: string, customerId: string) {
  const found = await prisma.billCheck.findUnique({ where: { id: checkId }, include: { biller: true } });
  if (!found || found.agentId !== agentId) throw badRequest('Data tagihan tidak ditemukan, silakan cek ulang', 'CHECK_INVALID');
  if (found.biller.key !== billerKey || found.customerId !== customerId) {
    throw badRequest('Data tagihan tidak cocok, silakan cek ulang', 'CHECK_INVALID');
  }
  const check = await refreshExpiry(found);
  if (check.status === 'EXPIRED') throw conflict(STATUS_MESSAGE.EXPIRED, 'CHECK_EXPIRED');
  if (check.status !== 'READY') throw conflict(STATUS_MESSAGE[check.status] ?? 'Tagihan belum siap', 'CHECK_NOT_READY');
  return check;
}

export async function claimCheck(tx: Prisma.TransactionClient, checkId: string) {
  const res = await tx.billCheck.updateMany({ where: { id: checkId, status: 'READY', expiresAt: { gt: new Date() } }, data: { status: 'USED' } });
  if (res.count === 0) throw conflict(STATUS_MESSAGE.USED, 'CHECK_USED');
}
