import { Request, Response } from 'express';
import { QRIS_FEE_ABOVE, QRIS_FEE_PERCENT } from 'pulsa-juan-common';
import { z } from 'zod';

import { prisma } from '../../prisma/client';
import { asyncHandler, badRequest } from '../lib/errors';
import { toPlain } from '../lib/serialize';
import { parse } from '../lib/validate';
import {
  agentProfile,
  changePin,
  googleLogin,
  googleSchema,
  loginAgent,
  loginSchema,
  loginWithPin,
  pinChangeSchema,
  pinLoginSchema,
  pinResetSchema,
  profileUpdateSchema,
  registerAgent,
  registerSchema,
  resetPin,
  updateProfile,
} from '../service/agentAuth.service';
import { claimCommissions, commissionSummary } from '../service/commission.service';
import * as bon from '../service/bon.service';
import { qrisEnabled } from '../service/qris.service';
import * as kyc from '../service/kyc.service';
import * as liveness from '../service/liveness.service';
import * as referral from '../service/referral.service';
import * as regions from '../service/region.service';
import * as sell from '../service/sellPrice.service';
import { getConfig, publicConfig } from '../service/config.service';
import { otpRequestSchema, otpVerifySchema, requestOtp, verifyOtp } from '../service/otp/otp.service';
import { getPrefixEntries } from '../service/prefix.service';
import { listLedger } from '../service/saldo.service';
import { listSegmentsForAgent, treeForAgent } from '../service/segment.service';
import * as topup from '../service/topup.service';
import * as trx from '../service/transaction.service';

export const postRegister = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await registerAgent(parse(registerSchema, req.body)));
});

export const postLogin = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = parse(loginSchema, req.body);
  const session = await loginAgent(identifier, password);
  if (!session) return res.status(401).json({ error: 'Email/nomor HP atau password salah' });
  res.json(session);
});

export const postGoogle = asyncHandler(async (req: Request, res: Response) => {
  res.json(await googleLogin(parse(googleSchema, req.body)));
});

export const postOtpRequest = asyncHandler(async (req: Request, res: Response) => {
  res.json(await requestOtp(parse(otpRequestSchema, req.body)));
});

export const postOtpVerify = asyncHandler(async (req: Request, res: Response) => {
  res.json(await verifyOtp(parse(otpVerifySchema, req.body)));
});

export const postPinLogin = asyncHandler(async (req: Request, res: Response) => {
  res.json(await loginWithPin(parse(pinLoginSchema, req.body)));
});

export const postPinReset = asyncHandler(async (req: Request, res: Response) => {
  res.json(await resetPin(parse(pinResetSchema, req.body)));
});

export const putPin = asyncHandler(async (req: Request, res: Response) => {
  res.json(await changePin(req.agent!, parse(pinChangeSchema, req.body)));
});

export const getLedger = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(z.object({ page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }), req.query);
  res.json(await listLedger(req.agent!.id, q.page, q.pageSize));
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await agentProfile(req.agent!));
});

export const putMe = asyncHandler(async (req: Request, res: Response) => {
  res.json(await updateProfile(req.agent!, parse(profileUpdateSchema, req.body)));
});

export const getHome = asyncHandler(async (req: Request, res: Response) => {
  // start of today in Asia/Jakarta (UTC+7)
  const now = Date.now();
  const startOfDay = new Date(Math.floor((now + 7 * 3600 * 1000) / 86400000) * 86400000 - 7 * 3600 * 1000);
  const [profile, config, segments, todayTransactions, unclaimed] = await Promise.all([
    agentProfile(req.agent!),
    getConfig(),
    listSegmentsForAgent(),
    prisma.transaction.count({ where: { agentId: req.agent!.id, createdAt: { gte: startOfDay }, status: { in: ['PENDING', 'SUCCESS'] } } }),
    prisma.agentMarkupCommision.aggregate({
      where: { beneficiaryCommisionId: req.agent!.commisionUniqueId, status: 'UNCLAIMED', transaction: { status: 'SUCCESS' } },
      _sum: { amount: true },
    }),
  ]);
  const pub = publicConfig(config);
  res.json({
    agent: profile,
    todayTransactions,
    commissionUnclaimed: unclaimed._sum.amount ?? 0,
    saldo: profile.saldo,
    hutang: profile.hutang,
    poin: profile.poin,
    markupTotal: profile.markupTotal,
    banners: pub.banners,
    groups: segments.groups,
    segments: segments.segments,
    cs: pub.cs,
    config: { topUpMin: pub.topUpMin, topUpMax: pub.topUpMax, appName: pub.appName, maxReferralMarkup: pub.maxReferralMarkup },
  });
});

export const getAgentConfig = asyncHandler(async (_req: Request, res: Response) => {
  const [config, prefixes, qrisOn] = await Promise.all([getConfig(), getPrefixEntries(), qrisEnabled()]);
  res.json({
    ...publicConfig(config),
    qris: { enabled: qrisOn, feePercent: QRIS_FEE_PERCENT, feeAbove: QRIS_FEE_ABOVE },
    prefixes,
    configVersion: config.updatedAt.getTime(),
  });
});

export const getSegmentTree = asyncHandler(async (req: Request, res: Response) => {
  res.json(await treeForAgent(req.agent!, req.params.id));
});

export const postInquiry = asyncHandler(async (req: Request, res: Response) => {
  res.json(toPlain(await trx.inquire(req.agent!, parse(trx.inquirySchema, req.body))));
});

export const getInquiry = asyncHandler(async (req: Request, res: Response) => {
  res.json(toPlain(await trx.getInquiry(req.agent!, req.params.id)));
});

export const postTopUp = asyncHandler(async (req: Request, res: Response) => {
  const { amount } = parse(topup.createTopUpSchema, req.body);
  res.status(201).json(toPlain(await topup.createTopUp(req.agent!, amount)));
});

export const putTopUpBank = asyncHandler(async (req: Request, res: Response) => {
  const { bank } = parse(topup.selectBankSchema, req.body);
  res.json(toPlain(await topup.selectBank(req.agent!.id, req.params.id, bank)));
});

export const postTopUpClaim = asyncHandler(async (req: Request, res: Response) => {
  res.json(toPlain(await topup.claimTopUp(req.agent!, req.params.id)));
});

export const getTopUps = asyncHandler(async (req: Request, res: Response) => {
  res.json({ topUps: toPlain(await topup.listTopUps(req.agent!.id)) });
});

export const getTopUp = asyncHandler(async (req: Request, res: Response) => {
  const order = (await topup.listTopUps(req.agent!.id)).find((t) => t.id === req.params.id);
  if (!order) throw badRequest('Top up tidak ditemukan');
  res.json(toPlain(await topup.withBankDetails(order)));
});

export const postTransaction = asyncHandler(async (req: Request, res: Response) => {
  const result = await trx.createTransaction(req.agent!, parse(trx.createTransactionSchema, req.body));
  res.status(result.reused ? 200 : 201).json(result);
});

export const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await trx.listForAgent(req.agent!.id, parse(trx.listSchema, req.query)));
});

export const getTransaction = asyncHandler(async (req: Request, res: Response) => {
  res.json(await trx.getForAgent(req.agent!.id, req.params.id));
});

export const getRekap = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(z.object({ from: z.string().optional(), to: z.string().optional() }), req.query);
  res.json(await trx.rekap(req.agent!, q.from, q.to));
});

export const getSellMargins = asyncHandler(async (req: Request, res: Response) => {
  res.json(sell.readSellMargins(req.agent!));
});

export const putSellMargins = asyncHandler(async (req: Request, res: Response) => {
  res.json(await sell.saveSellMargins(req.agent!.id, parse(sell.sellMarginsSchema, req.body)));
});

export const putTransactionSellPrice = asyncHandler(async (req: Request, res: Response) => {
  const { sellPrice } = parse(sell.sellPriceSchema, req.body);
  res.json(await sell.setSellPrice(req.agent!, req.params.id, sellPrice));
});

export const getSellPrices = asyncHandler(async (req: Request, res: Response) => {
  res.json(await sell.listSellPrices(req.agent!.id));
});

export const deleteSellPrice = asyncHandler(async (req: Request, res: Response) => {
  res.json(await sell.deleteSellPrice(req.agent!.id, req.params.id));
});

export const postTransactionBon = asyncHandler(async (req: Request, res: Response) => {
  res.json(await bon.bonTokenFor(req.agent!.id, req.params.id));
});

export const getCommissions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await commissionSummary(req.agent!));
});

export const postClaimCommissions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await claimCommissions(req.agent!));
});

export const getMitra = asyncHandler(async (req: Request, res: Response) => {
  res.json(await referral.mitraOverview(req.agent!));
});

export const postMitraReferrer = asyncHandler(async (req: Request, res: Response) => {
  const { code } = parse(referral.setReferrerSchema, req.body);
  res.json(await referral.setReferrer(req.agent!, code));
});

export const getRegionProvinces = asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json(regions.listProvinces());
});

export const getRegionChildren = asyncHandler(async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json(regions.listChildren(req.params.code));
});

export const postRegionMatch = asyncHandler(async (req: Request, res: Response) => {
  res.json(regions.matchRegion(parse(regions.regionMatchSchema, req.body)));
});

function uploaded(req: Request, field: string) {
  const f = req.files?.[field];
  const one = Array.isArray(f) ? f[0] : f;
  return one ? { data: one.data, mimetype: one.mimetype, size: one.size } : null;
}

export const getKyc = asyncHandler(async (req: Request, res: Response) => {
  res.json(await kyc.kycState(req.agent!));
});

export const postLivenessStart = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await liveness.startChallenge(req.agent!));
});

/** multipart: frame0 (white baseline), frame1..frameN (one per colour, in order) */
export const postLivenessCheck = asyncHandler(async (req: Request, res: Response) => {
  const frames: { data: Buffer; mimetype: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const f = uploaded(req, `frame${i}`);
    if (!f) break;
    frames.push(f);
  }
  res.json(await liveness.checkChallenge(req.agent!, req.params.id, frames));
});

/** multipart: ktp, selfie + fields livenessId, nik, name, ocrNik?, ocrName?, ocrText? */
export const postKyc = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(kyc.kycSubmitSchema, req.body ?? {});
  res.status(201).json(await kyc.submitKyc(req.agent!, input, uploaded(req, 'ktp'), uploaded(req, 'selfie')));
});
