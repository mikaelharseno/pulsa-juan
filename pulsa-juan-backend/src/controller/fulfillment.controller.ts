import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../prisma/client';
import { asyncHandler, HttpError, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { settleTransaction } from '../service/transaction.service';

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
