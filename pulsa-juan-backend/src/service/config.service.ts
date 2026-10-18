import { z } from 'zod';

import { prisma } from '../../prisma/client';

export const bannerSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  linkUrl: z.string().trim().max(500).optional(),
});

export const configUpdateSchema = z.object({
  appName: z.string().trim().min(1).max(60).optional(),
  csWhatsapp: z.string().trim().max(30).optional(),
  csTelegram: z.string().trim().max(60).optional(),
  topUpMin: z.number().int().min(1000).optional(),
  topUpMax: z.number().int().min(1000).optional(),
  topUpExpiryHours: z.number().int().min(1).max(168).optional(),
  briAccountNumber: z.string().trim().max(40).optional(),
  briAccountName: z.string().trim().max(80).optional(),
  bcaAccountNumber: z.string().trim().max(40).optional(),
  bcaAccountName: z.string().trim().max(80).optional(),
  banners: z.array(bannerSchema).max(10).optional(),
  maxReferralMarkup: z.number().int().min(0).max(100000).optional(),
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
  return prisma.storeConfig.update({ where: { id: 'singleton' }, data });
}

export type BankCode = 'BRI' | 'BCA';

export function bankAccounts(config: Awaited<ReturnType<typeof getConfig>>) {
  const list: { bank: BankCode; accountNumber: string; accountName: string }[] = [];
  if (config.briAccountNumber) list.push({ bank: 'BRI', accountNumber: config.briAccountNumber, accountName: config.briAccountName });
  if (config.bcaAccountNumber) list.push({ bank: 'BCA', accountNumber: config.bcaAccountNumber, accountName: config.bcaAccountName });
  return list;
}

/** What the agent app is allowed to see. */
export function publicConfig(config: Awaited<ReturnType<typeof getConfig>>) {
  return {
    appName: config.appName,
    cs: { whatsapp: config.csWhatsapp, telegram: config.csTelegram },
    topUpMin: config.topUpMin,
    topUpMax: config.topUpMax,
    topUpExpiryHours: config.topUpExpiryHours,
    banners: (config.banners as Banner[]) ?? [],
    bankAccounts: bankAccounts(config),
    maxReferralMarkup: config.maxReferralMarkup,
  };
}
