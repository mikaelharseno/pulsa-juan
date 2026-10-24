import { formatRp, PROVIDERS, SegmentTree } from 'pulsa-juan-common';
import { z } from 'zod';

import { Package, Prisma, Provider } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { audit } from './audit.service';
import { createSegment, publishSegment, saveDraft } from './segment.service';

// Product Updater: an OtomaX price sheet (one sheet per operator: KODE PRODUK,
// NAMA, KATEGORI, KET, harga = our cost) becomes Packages priced at
// cost + margin, plus one "Paket <Operator>" app tile per operator whose tree
// is regenerated from the active categories. Packages it manages carry
// supplierName = 'OtomaX'; only those are ever deactivated.

export const MANAGED_SUPPLIER = 'OtomaX';

const ruleSchema = z.object({
  fixed: z.number().int().min(0).max(1_000_000),
  percent: z.number().min(0).max(100),
  roundTo: z.number().int().min(1).max(100_000),
});

const rowSchema = z.object({
  provider: z.enum(PROVIDERS),
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().max(1000).optional().nullable(),
  cost: z.number().int(),
  agentPrice: z.number().int().positive().optional().nullable(),
});

export const updaterSchema = z.object({
  fileName: z.string().trim().max(200).default('upload.xlsx'),
  rule: ruleSchema,
  rows: z.array(rowSchema).min(1).max(3000),
});

export type UpdaterInput = z.infer<typeof updaterSchema>;
export type PriceRule = z.infer<typeof ruleSchema>;

export type RowStatus = 'NEW' | 'PRICE_CHANGED' | 'DETAILS_CHANGED' | 'UNCHANGED' | 'REACTIVATED' | 'DEACTIVATED' | 'ERROR';

export interface PreviewRow {
  sku: string;
  provider: Provider;
  name: string;
  category: string;
  categoryLabel: string;
  status: RowStatus;
  cost: number | null;
  oldCost: number | null;
  agentPrice: number | null;
  oldAgentPrice: number | null;
  priceLocked: boolean;
  warnings: string[];
  error: string | null;
}

const SKU_RE = /^[A-Za-z0-9_.-]+$/;

export function agentPriceFor(cost: number, rule: PriceRule) {
  const raw = cost + rule.fixed + (cost * rule.percent) / 100;
  return Math.ceil(raw / rule.roundTo) * rule.roundTo;
}

export function categoryKey(provider: Provider, kategori: string) {
  const slug = kategori.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'LAINNYA';
  return `${provider}_${slug}`;
}

const LABELS: Record<string, string> = { HIFI: 'HiFi Air', TELP: 'Telepon', AON: 'AON', '5G': '5G' };

export function categoryLabel(kategori: string) {
  const key = kategori.trim().toUpperCase();
  if (LABELS[key]) return LABELS[key];
  return key
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

interface Planned {
  rows: PreviewRow[];
  upserts: { existing: Package | null; data: Prisma.PackageCreateInput }[];
  deactivate: Package[];
  providers: Provider[];
  categoryLabels: Record<string, string>;
}

async function plan(input: UpdaterInput): Promise<Planned> {
  const providers = Array.from(new Set(input.rows.map((r) => r.provider)));
  const skus = input.rows.map((r) => r.sku);
  const existingRows = await prisma.package.findMany({
    where: { OR: [{ code: { in: skus } }, { supplierName: MANAGED_SUPPLIER, provider: { in: providers } }] },
  });
  const byCode = new Map(existingRows.map((p) => [p.code, p]));

  const rows: PreviewRow[] = [];
  const upserts: Planned['upserts'] = [];
  const seen = new Set<string>();
  const categoryLabels: Record<string, string> = {};
  const sortByProvider: Record<string, number> = {};

  for (const r of input.rows) {
    const category = categoryKey(r.provider, r.category);
    const label = categoryLabel(r.category);
    categoryLabels[category] = label;
    const existing = byCode.get(r.sku) ?? null;
    const base: PreviewRow = {
      sku: r.sku,
      provider: r.provider,
      name: r.name,
      category,
      categoryLabel: label,
      status: 'ERROR',
      cost: r.cost,
      oldCost: existing?.hargaBeli ?? null,
      agentPrice: null,
      oldAgentPrice: existing?.hargaAgen ?? null,
      priceLocked: existing?.priceLocked ?? false,
      warnings: [],
      error: null,
    };
    if (seen.has(r.sku)) {
      rows.push({ ...base, error: 'Kode produk dobel di file' });
      continue;
    }
    seen.add(r.sku);
    if (!SKU_RE.test(r.sku)) {
      rows.push({ ...base, error: 'Kode produk hanya boleh huruf/angka/_-.' });
      continue;
    }
    if (r.cost <= 0) {
      rows.push({ ...base, error: 'Harga kosong / tidak valid' });
      continue;
    }
    if (existing && existing.supplierName !== MANAGED_SUPPLIER) {
      rows.push({ ...base, error: `Kode sudah dipakai paket lain (${existing.name})` });
      continue;
    }

    const locked = r.agentPrice ? true : existing?.priceLocked ?? false;
    const agentPrice = r.agentPrice ?? (locked && existing ? existing.hargaAgen : agentPriceFor(r.cost, input.rule));
    sortByProvider[r.provider] = (sortByProvider[r.provider] ?? 0) + 1;
    const data: Prisma.PackageCreateInput = {
      code: r.sku,
      name: r.name,
      description: r.description || null,
      category,
      provider: r.provider,
      hargaAgen: agentPrice,
      hargaBeli: r.cost,
      supplierName: MANAGED_SUPPLIER,
      supplierSku: r.sku,
      priceLocked: locked,
      isActive: true,
      sortOrder: sortByProvider[r.provider],
    };

    let status: RowStatus = 'NEW';
    if (existing) {
      const priceChanged = existing.hargaBeli !== r.cost || existing.hargaAgen !== agentPrice;
      const detailsChanged =
        existing.name !== data.name ||
        (existing.description ?? null) !== data.description ||
        existing.category !== category ||
        existing.provider !== r.provider ||
        existing.sortOrder !== data.sortOrder ||
        existing.priceLocked !== locked;
      status = !existing.isActive ? 'REACTIVATED' : priceChanged ? 'PRICE_CHANGED' : detailsChanged ? 'DETAILS_CHANGED' : 'UNCHANGED';
    }
    const warnings: string[] = [];
    if (agentPrice <= r.cost) warnings.push(`Harga agen ${formatRp(agentPrice)} tidak di atas modal ${formatRp(r.cost)}`);
    if (locked && !r.agentPrice) warnings.push('Harga terkunci (diatur manual), tidak ikut margin');
    rows.push({ ...base, status, agentPrice, priceLocked: locked, warnings });
    upserts.push({ existing, data });
  }

  const deactivate = existingRows.filter(
    (p) => p.supplierName === MANAGED_SUPPLIER && p.isActive && p.provider && providers.includes(p.provider) && !seen.has(p.code),
  );
  for (const p of deactivate) {
    rows.push({
      sku: p.code,
      provider: p.provider!,
      name: p.name,
      category: p.category,
      categoryLabel: p.category,
      status: 'DEACTIVATED',
      cost: null,
      oldCost: p.hargaBeli,
      agentPrice: null,
      oldAgentPrice: p.hargaAgen,
      priceLocked: p.priceLocked,
      warnings: ['Tidak ada di file: disembunyikan dari aplikasi'],
      error: null,
    });
  }
  return { rows, upserts, deactivate, providers, categoryLabels };
}

function summarize(rows: PreviewRow[]) {
  const counts: Record<RowStatus, number> = { NEW: 0, PRICE_CHANGED: 0, DETAILS_CHANGED: 0, UNCHANGED: 0, REACTIVATED: 0, DEACTIVATED: 0, ERROR: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

export async function previewUpdate(input: UpdaterInput) {
  const p = await plan(input);
  return { rows: p.rows, summary: summarize(p.rows) };
}

// ---- app tiles ----

const PROVIDER_LABEL: Record<Provider, string> = {
  TELKOMSEL: 'Telkomsel',
  XL: 'XL',
  AXIS: 'Axis',
  INDOSAT: 'Indosat',
  TRI: 'Tri',
  SMARTFREN: 'Smartfren',
};

export function segmentSlugFor(provider: Provider) {
  return `paket-${provider.toLowerCase()}`;
}

/** Tree: phone (provider-locked) → category list → packages of that category. */
export function buildProviderTree(provider: Provider, categories: { key: string; label: string; count: number; minPrice: number }[]): SegmentTree {
  const label = PROVIDER_LABEL[provider];
  const nodes: SegmentTree['nodes'] = {
    phone: {
      id: 'phone',
      type: 'PhoneNumberInput',
      title: `Paket ${label}`,
      label: `Nomor HP ${label}`,
      allowedProviders: [provider],
      branches: {},
      defaultChildId: 'cat',
    },
    cat: {
      id: 'cat',
      type: 'ListNode',
      title: 'Pilih Kategori',
      rows: categories.map((c) => ({
        id: `r_${c.key.toLowerCase()}`,
        label: c.label,
        sublabel: `${c.count} paket · mulai ${formatRp(c.minPrice)}`,
        childId: `pk_${c.key.toLowerCase()}`,
        isActive: true,
      })),
    },
  };
  for (const c of categories) {
    nodes[`pk_${c.key.toLowerCase()}`] = {
      id: `pk_${c.key.toLowerCase()}`,
      type: 'PackagesList',
      title: `${label} · ${c.label}`,
      source: { kind: 'CATEGORY', category: c.key },
      nextId: null,
    };
  }
  return { schemaVersion: 1, rootId: 'phone', nodes } as SegmentTree;
}

/** JSON with sorted keys: Postgres JSONB does not keep key order, so plain stringify never matches. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Ensures the "Paket <Operator>" tile exists and publishes a new tree version when it changed. */
async function syncProviderSegment(adminId: string, provider: Provider, categoryLabels: Record<string, string>) {
  const active = await prisma.package.findMany({
    where: { provider, supplierName: MANAGED_SUPPLIER, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { category: true, hargaAgen: true },
  });
  const slug = segmentSlugFor(provider);
  let segment = await prisma.segment.findUnique({ where: { slug }, include: { publishedVersion: true } });
  if (active.length === 0) {
    if (segment?.isActive) await prisma.segment.update({ where: { id: segment.id }, data: { isActive: false } });
    return { provider, slug, published: false, categories: 0 };
  }
  const categories: { key: string; label: string; count: number; minPrice: number }[] = [];
  for (const p of active) {
    let c = categories.find((x) => x.key === p.category);
    if (!c) {
      c = { key: p.category, label: categoryLabels[p.category] ?? categoryLabel(p.category.replace(`${provider}_`, '').replace(/_/g, ' ')), count: 0, minPrice: p.hargaAgen };
      categories.push(c);
    }
    c.count++;
    c.minPrice = Math.min(c.minPrice, p.hargaAgen);
  }
  const tree = buildProviderTree(provider, categories);
  if (!segment) {
    await createSegment({
      slug,
      label: `Paket ${PROVIDER_LABEL[provider]}`,
      iconUrl: `builtin:${provider.toLowerCase()}`,
      groupLabel: 'Pulsa & Data',
      isActive: true,
    });
    segment = await prisma.segment.findUniqueOrThrow({ where: { slug }, include: { publishedVersion: true } });
  }
  const unchanged = canonical(segment.publishedVersion?.tree ?? null) === canonical(tree);
  if (!segment.isActive) await prisma.segment.update({ where: { id: segment.id }, data: { isActive: true } });
  if (unchanged) return { provider, slug, published: false, categories: categories.length };
  await saveDraft(adminId, segment.id, tree);
  const published = await publishSegment(adminId, segment.id);
  return { provider, slug, published: true, version: published.publishedVersion?.version ?? null, categories: categories.length };
}

export async function applyUpdate(adminId: string, input: UpdaterInput) {
  const p = await plan(input);
  const summary = summarize(p.rows);
  await prisma.$transaction(async (tx) => {
    for (const u of p.upserts) {
      if (u.existing) await tx.package.update({ where: { id: u.existing.id }, data: u.data });
      else await tx.package.create({ data: u.data });
    }
    if (p.deactivate.length) {
      await tx.package.updateMany({ where: { id: { in: p.deactivate.map((d) => d.id) } }, data: { isActive: false } });
    }
    await tx.storeConfig.update({
      where: { id: 'singleton' },
      data: { productMarginFixed: input.rule.fixed, productMarginPercent: input.rule.percent, productPriceRoundTo: input.rule.roundTo },
    });
  }, { timeout: 60_000 });

  const segments = [];
  for (const provider of p.providers) segments.push(await syncProviderSegment(adminId, provider, p.categoryLabels));

  const record = await prisma.productUpdate.create({
    data: { adminId, fileName: input.fileName, summary: { counts: summary, rule: input.rule, providers: p.providers, segments } as Prisma.InputJsonValue },
  });
  await audit(adminId, 'PRODUCT_UPDATE', 'ProductUpdate', record.id, { fileName: input.fileName, counts: summary });
  return { id: record.id, rows: p.rows, summary, segments };
}

export async function listUpdates() {
  const rows = await prisma.productUpdate.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  const admins = await prisma.adminUser.findMany({ where: { id: { in: rows.map((r) => r.adminId) } }, select: { id: true, name: true, email: true } });
  const byId = Object.fromEntries(admins.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, admin: byId[r.adminId] ?? null }));
}

export async function currentRule(): Promise<PriceRule> {
  const c = await prisma.storeConfig.findUnique({ where: { id: 'singleton' } });
  return { fixed: c?.productMarginFixed ?? 0, percent: c?.productMarginPercent ?? 0, roundTo: c?.productPriceRoundTo ?? 100 };
}
