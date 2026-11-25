import { z } from 'zod';

import { prisma } from '../../prisma/client';
import { resetAppVersionCache } from '../lib/appVersion';

export const bannerSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  linkUrl: z.string().trim().max(500).optional(),
});

export const configUpdateSchema = z.object({
  appName: z.string().trim().min(1).max(60).optional(),
  csWhatsapp: z.string().trim().max(30).optional(),
  csFinanceWhatsapp: z.string().trim().max(30).optional(),
  csTelegram: z.string().trim().max(60).optional(),
  topUpMin: z.number().int().min(1000).optional(),
  topUpMax: z.number().int().min(1000).optional(),
  topUpExpiryHours: z.number().int().min(1).max(168).optional(),
  briAccountNumber: z.string().trim().max(40).optional(),
  briAccountName: z.string().trim().max(80).optional(),
  bcaAccountNumber: z.string().trim().max(40).optional(),
  bcaAccountName: z.string().trim().max(80).optional(),
  mandiriAccountNumber: z.string().trim().max(40).optional(),
  mandiriAccountName: z.string().trim().max(80).optional(),
  /** oldest app version allowed; "" = no forced update */
  minAppVersion: z.string().trim().regex(/^(\d+\.\d+\.\d+)?$/, 'Format versi x.y.z, mis. 1.3.0').optional(),
  appDownloadUrl: z.string().trim().url('Link download harus URL lengkap (https://...)').max(500).optional(),
  banners: z.array(bannerSchema).max(10).optional(),
  maxReferralMarkup: z.number().int().min(0).max(100000).optional(),
  requirePurchasePin: z.boolean().optional(),
});

export type Banner = z.infer<typeof bannerSchema>;

export async function getConfig() {
  return prisma.storeConfig.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
}

export async function updateConfig(data: z.infer<typeof configUpdateSchema>) {
  const current = await getConfig();
  const min = data.topUpMin ?? current.topUpMin;
  const max = data.topUpMax ?? current.topUpMax;
  if (min > max) throw new Error('Top up minimal tidak boleh melebihi maksimal');
  const updated = await prisma.storeConfig.update({ where: { id: 'singleton' }, data });
  resetAppVersionCache();
  return updated;
}

export type BankCode = 'BRI' | 'BCA' | 'MANDIRI' | 'QRIS';

/**
 * Bank transfer accounts that are filled in. `mandiri: false` leaves Mandiri
 * out for apps older than 1.3.0, whose bank screen crashes on an unknown bank.
 */
export function bankAccounts(config: Awaited<ReturnType<typeof getConfig>>, opts: { mandiri?: boolean } = {}) {
  const list: { bank: BankCode; accountNumber: string; accountName: string }[] = [];
  if (config.briAccountNumber) list.push({ bank: 'BRI', accountNumber: config.briAccountNumber, accountName: config.briAccountName });
  if (config.bcaAccountNumber) list.push({ bank: 'BCA', accountNumber: config.bcaAccountNumber, accountName: config.bcaAccountName });
  if (config.mandiriAccountNumber && opts.mandiri !== false) {
    list.push({ bank: 'MANDIRI', accountNumber: config.mandiriAccountNumber, accountName: config.mandiriAccountName });
  }
  return list;
}

/** Apps from this version on know Bank Mandiri. */
export const MANDIRI_APP_VERSION = '1.3.0';

/** What the agent app is allowed to see. */
export function publicConfig(config: Awaited<ReturnType<typeof getConfig>>, opts: { mandiri?: boolean } = {}) {
  return {
    appName: config.appName,
    // whatsapp = CS Komplain (orders); financeWhatsapp = CS Finance (saldo top-ups), falls back to Komplain
    cs: { whatsapp: config.csWhatsapp, telegram: config.csTelegram, financeWhatsapp: config.csFinanceWhatsapp || config.csWhatsapp },
    topUpMin: config.topUpMin,
    topUpMax: config.topUpMax,
    topUpExpiryHours: config.topUpExpiryHours,
    banners: (config.banners as Banner[]) ?? [],
    bankAccounts: bankAccounts(config, opts),
    maxReferralMarkup: config.maxReferralMarkup,
    minAppVersion: config.minAppVersion,
    appDownloadUrl: config.appDownloadUrl,
  };
}
