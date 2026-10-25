import 'dotenv/config';
import bcrypt from 'bcrypt';
import { DEFAULT_PREFIXES, hasBlockingErrors, SEED_PACKAGES, SEED_SEGMENTS, validateTreeStructure } from 'pulsa-juan-common';

import { Prisma, Provider } from './generated';
import { prisma } from './client';

// Built-in icon (pulsa-juan-common ICONS key) for each seed segment.
const SEED_ICON_BY_SLUG: Record<string, string> = {
  pulsa: 'pulsa',
  xl: 'xl',
  telkomsel: 'telkomsel',
  'paket-data': 'paket-data',
  'token-pln': 'token-pln',
  'pln-pascabayar': 'pln-pascabayar',
  telkom: 'internet',
  gopay: 'gopay',
  'mobile-legends': 'mobile-legends',
};

const SEED_BILLERS = [
  { key: 'PLN_POSTPAID', name: 'PLN Pascabayar' },
  { key: 'TELKOM', name: 'Telkom / IndiHome' },
];

// Idempotent: safe to re-run. Never overwrites an existing published tree.
export async function seed() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@pulsajuan.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Owner', role: 'OWNER', passwordHash: await bcrypt.hash(password, 10) },
  });

  await prisma.storeConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      csWhatsapp: '081234567890',
      csTelegram: 'pulsajuan_cs',
      briAccountNumber: '0000-01-000000-00-0',
      briAccountName: 'PT PULSA JUAN',
      bcaAccountNumber: '0000000000',
      bcaAccountName: 'PT PULSA JUAN',
      banners: [
        { imageUrl: 'https://placehold.co/1200x675/1E9C8F/ffffff?text=Promo+Pulsa+Juan' },
        { imageUrl: 'https://placehold.co/1200x675/F28C28/ffffff?text=Top+Up+Saldo+Mudah' },
      ],
    },
  });

  for (const p of DEFAULT_PREFIXES) {
    await prisma.providerPrefix.upsert({ where: { prefix: p.prefix }, update: {}, create: { prefix: p.prefix, provider: p.provider } });
  }

  for (const p of SEED_PACKAGES) {
    await prisma.package.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code,
        name: p.name,
        category: p.category,
        provider: (p.provider as Provider | undefined) ?? null,
        hargaAgen: p.hargaAgen,
        hargaBeli: p.hargaBeli,
        sortOrder: p.sortOrder,
      },
    });
  }

  await seedBillers();
  await seedSegments(SEED_SEGMENTS);
}

// billers start inactive with empty OtomaX codes; filled in on the dashboard (Tagihan page)
async function seedBillers() {
  for (const b of SEED_BILLERS) {
    await prisma.biller.upsert({ where: { key: b.key }, update: {}, create: b });
  }
}

/** Creates missing seed segments (published v1); existing ones only get a missing icon filled in. */
async function seedSegments(segments: typeof SEED_SEGMENTS) {
  const packages = Object.fromEntries((await prisma.package.findMany()).map((p) => [p.id, { ...p, description: p.description ?? undefined }]));
  for (const s of segments) {
    const errors = validateTreeStructure(s.tree, { strict: true, packages: packages as never });
    if (hasBlockingErrors(errors)) throw new Error(`Seed tree ${s.slug} invalid: ` + JSON.stringify(errors));
    const existing = await prisma.segment.findUnique({ where: { slug: s.slug } });
    const iconUrl = 'builtin:' + (SEED_ICON_BY_SLUG[s.slug] ?? 'lainnya');
    if (existing) {
      if (!existing.iconUrl) await prisma.segment.update({ where: { id: existing.id }, data: { iconUrl } });
      continue;
    }
    const tree = s.tree as unknown as Prisma.InputJsonValue;
    await prisma.$transaction(async (tx) => {
      const segment = await tx.segment.create({
        data: { slug: s.slug, label: s.label, groupLabel: s.groupLabel, sortOrder: s.sortOrder, isActive: s.isActive, draftTree: tree, iconUrl },
      });
      const v = await tx.segmentTreeVersion.create({ data: { segmentId: segment.id, version: 1, tree, publishedBy: 'seed' } });
      await tx.segment.update({ where: { id: segment.id }, data: { publishedVersionId: v.id } });
    });
  }
}

/**
 * Production-safe subset for the bill-payment rollout (`npm run seed:bills:prod`):
 * the two billers and the bill tiles, created only if missing. Unlike the full seed it
 * never recreates demo packages/prefixes/tiles that were removed on production.
 */
export async function seedBillPayments() {
  await seedBillers();
  await seedSegments(SEED_SEGMENTS.filter((s) => s.slug === 'pln-pascabayar' || s.slug === 'telkom'));
}

if (require.main === module) {
  (process.argv.includes('--bills-only') ? seedBillPayments() : seed())
    .then(() => {
      console.log('seed complete');
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
