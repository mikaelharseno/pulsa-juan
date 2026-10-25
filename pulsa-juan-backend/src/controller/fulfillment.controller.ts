import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../prisma/client';
import { asyncHandler, HttpError, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { reportCheck } from '../service/bill.service';
import { checkRefPrefix, parseOtomaxMessage } from '../service/fulfillment/otomax';
import { applySupplierOutcome, settleTransaction } from '../service/transaction.service';

// Supplier result callback (semi-automated fulfilment). Body is our normalised
// shape; the Otomax report format gets mapped onto it once the integration lands.
const callbackSchema = z.object({
  transactionId: z.string().min(1),
  status: z.enum(['SUCCESS', 'FAILED']),
  serialNumber: z.string().trim().max(120).optional(),
  reason: z.string().trim().max(200).optional(),
  supplierRef: z.string().trim().max(120).optional(),
});

function secretMatches(given: string | undefined, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const postCallback = asyncHandler(async (req: Request, res: Response) => {
  const secret = process.env.FULFILLMENT_CALLBACK_SECRET;
  if (!secret) throw new HttpError(503, 'Callback belum dikonfigurasi');
  if (!secretMatches(req.header('x-callback-secret'), secret)) throw new HttpError(401, 'Secret tidak valid');
  const input = parse(callbackSchema, req.body);
  const trx = await prisma.transaction.findUnique({ where: { id: input.transactionId }, select: { id: true, provider: true } });
  if (!trx || trx.provider !== req.params.provider) throw notFound('Transaksi tidak ditemukan');
  if (input.supplierRef) await prisma.transaction.update({ where: { id: trx.id }, data: { supplierRef: input.supplierRef } });
  const settled = await settleTransaction(
    trx.id,
    input.status === 'SUCCESS' ? { status: 'SUCCESS', serialNumber: input.serialNumber } : { status: 'FAILED', failReason: input.reason },
    null,
  );
  res.json({ ok: true, status: settled.status });
});

/**
 * OtomaX report URL (set on the reseller in OtomaX):
 *   https://<api>/api/fulfillment/otomax/report?key=<OTOMAX_REPORT_KEY>
 * OtomaX adds refid + message (query or form). OtomaX can't send headers, so the
 * secret is in the URL; OTOMAX_REPORT_IPS optionally pins the center's IP
 * (nginx passes the client IP as X-Real-IP). Always answers "OK" once
 * authenticated so OtomaX stops retrying.
 */
export const otomaxReport = asyncHandler(async (req: Request, res: Response) => {
  const key = process.env.OTOMAX_REPORT_KEY;
  if (!key) throw new HttpError(503, 'Report OtomaX belum dikonfigurasi');
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) })) {
    if (typeof v === 'string') params[k.toLowerCase()] = v;
  }
  if (!secretMatches(params.key, key)) throw new HttpError(401, 'Key tidak valid');
  const allowed = (process.env.OTOMAX_REPORT_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = (req.header('x-real-ip') ?? req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  if (allowed.length && !allowed.includes(ip)) throw new HttpError(403, 'IP tidak diizinkan');

  const rawRef = (params.refid ?? '').trim();
  const message = (params.message ?? params.msg ?? '').trim();
  // bill checks use refID = prefix + BillCheck.number; orders use the bare trxNumber
  const prefix = checkRefPrefix();
  if (rawRef.toUpperCase().startsWith(prefix.toUpperCase()) && /^\d+$/.test(rawRef.slice(prefix.length))) {
    const known = await reportCheck(Number(rawRef.slice(prefix.length)), message);
    if (!known) console.warn(`otomax report for unknown check ${rawRef}: ${message.slice(0, 120)}`);
    return res.type('text/plain').send('OK');
  }
  const refId = Number(rawRef);
  const trx = Number.isInteger(refId) && refId > 0
    ? await prisma.transaction.findFirst({ where: { trxNumber: refId, provider: 'otomax' }, select: { id: true } })
    : null;
  if (!trx) {
    console.warn(`otomax report for unknown refid ${params.refid}: ${message.slice(0, 120)}`);
    return res.type('text/plain').send('OK');
  }
  const parsed = parseOtomaxMessage(message);
  await applySupplierOutcome(
    trx.id,
    parsed.status === 'FAILED'
      ? { status: 'FAILED', reason: message, message }
      : parsed.status === 'SUCCESS'
        ? { status: 'SUCCESS', serialNumber: parsed.serialNumber, message }
        : { status: 'PENDING', message },
  );
  res.type('text/plain').send('OK');
});
