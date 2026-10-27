import crypto from 'crypto';
import { formatRp, PRODUCT_TILES, ProductTile, PROVIDERS, SegmentTree, TreeNode, validateTreeStructure } from 'pulsa-juan-common';
import { z } from 'zod';

import { Package, Prisma, Provider } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest } from '../lib/errors';
import { audit } from './audit.service';
import { createSegment, publishSegment, saveDraft } from './segment.service';

// Product Updater: an OtomaX price sheet (one sheet per operator: KODE PRODUK,
// NAMA, KATEGORI, KET, harga = our cost) becomes Packages priced at
// cost + margin, plus one app tile per PRODUCT_TILES entry ("Paket <Operator>",
// DANA, Token PLN, Mobile Legends, ...) whose tree is regenerated from the
// active categories. A tile owns the packages of its operator, or (non-operator
// tiles) the provider-less packages whose category starts with "<TILE>_".
// Packages it manages carry supplierName = 'OtomaX'; only those are deactivated,
// plus the market (PSR-) products of operators listed in retireMarketFor. The
// dashboard also turns OtomaX's own product export into these rows
// (pulsa-juan-common otomaxExport).

export const MANAGED_SUPPLIER = 'OtomaX';
/** Products imported from market reference price lists (other sellers' codes → manual fulfilment) */
export const MARKET_SUPPLIER = 'Pasar';
export const MARKET_CODE_PREFIX = 'PSR-';
const MANAGED_SUPPLIERS = [MANAGED_SUPPLIER, MARKET_SUPPLIER];

const ruleSchema = z.object({
  fixed: z.number().int().min(0).max(1_000_000),
  percent: z.number().min(0).max(100),
  roundTo: z.number().int().min(1).max(100_000),
});

const rowSchema = z.object({
  /** operator rows; other rows name their tile */
  provider: z.enum(PROVIDERS).nullable().optional(),
  tile: z
    .string()
    .refine((t) => !!PRODUCT_TILES[t], 'Tile tidak dikenal')
    .optional(),
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  // raw KATEGORI text; the stored category key is shortened to 60 by categoryKey()
  category: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  cost: z.number().int(),
  agentPrice: z.number().int().positive().optional().nullable(),
});

export const updaterSchema = z.object({
  fileName: z.string().trim().max(200).default('upload.xlsx'),
  /**
   * OTOMAX: KODE PRODUK is our OtomaX code → fulfilled automatically.
   * MARKET: codes come from another seller's price list → stored as PSR-<code>, no
   * OtomaX code (manual) unless an admin later sets one on the Paket page.
   */
  codeType: z.enum(['OTOMAX', 'MARKET']).default('OTOMAX'),
  /** OTOMAX imports only: operators whose market (PSR-) products are hidden now that OtomaX sells them */
  retireMarketFor: z.array(z.enum(PROVIDERS)).max(PROVIDERS.length).default([]),
  rule: ruleSchema,
  rows: z
    .array(rowSchema)
    .min(1)
    .max(3000)
    .refine((rows) => rows.every((r) => r.tile || r.provider), 'Setiap baris butuh operator atau tile'),
});

export type UpdaterInput = z.infer<typeof updaterSchema>;
export type PriceRule = z.infer<typeof ruleSchema>;

export type RowStatus = 'NEW' | 'PRICE_CHANGED' | 'DETAILS_CHANGED' | 'UNCHANGED' | 'REACTIVATED' | 'DEACTIVATED' | 'ERROR';

export interface PreviewRow {
  sku: string;
  tile: string;
  provider: Provider | null;
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

/** `s` cut to `max` chars with a short stable hash suffix when it is longer (keeps ids unique). */
function fit(s: string, max: number) {
  if (s.length <= max) return s;
  const hash = crypto.createHash('sha1').update(s).digest('hex').slice(0, 6);
  return `${s.slice(0, max - 7).replace(/_+$/, '')}_${hash}`;
}

/** `tile` is a PRODUCT_TILES key (an operator for phone products). */
export function categoryKey(tile: string, kategori: string) {
  const slug = kategori.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'LAINNYA';
  // Package.category is edited on the Paket page (max 60)
  return fit(`${tile}_${slug}`, 60);
}

/** Row → its tile (rows from operator sheets only carry the provider). */
function rowTile(r: { tile?: string | null; provider?: Provider | null }): ProductTile {
  return PRODUCT_TILES[(r.tile ?? r.provider)!];
}

/** Packages a tile owns. */
function tileScope(t: ProductTile): Prisma.PackageWhereInput {
  return t.operator ? { provider: t.operator } : { provider: null, category: { startsWith: `${t.key}_` } };
}

function inTile(p: { provider: Provider | null; category: string }, t: ProductTile) {
  return t.operator ? p.provider === t.operator : !p.provider && p.category.startsWith(`${t.key}_`);
}

/** Tree node ids are limited to 40 chars of [A-Za-z0-9_-]. */
const nodeId = (prefix: string, key: string) => fit(`${prefix}_${key.toLowerCase()}`, 40);

const LABELS: Record<string, string> = { HIFI: 'HiFi Air', 'HIFI AIR': 'HiFi Air', TELP: 'Telepon', AON: 'AON', '5G': '5G', SMS: 'SMS', 'BY.U': 'by.U' };

export function categoryLabel(kategori: string) {
  const key = kategori.trim().toUpperCase();
  if (LABELS[key]) return LABELS[key];
  // already cased (OtomaX group labels like "Tapcash BNI", market files): keep it; ALL-CAPS sheet labels get title case
  if (/[a-z]/.test(kategori)) return kategori.trim().replace(/\s+/g, ' ');
  return key
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

interface Planned {
  rows: PreviewRow[];
  upserts: { existing: Package | null; tile: string; data: Prisma.PackageCreateInput }[];
  deactivate: Package[];
  tiles: ProductTile[];
  categoryLabels: Record<string, string>;
}

async function plan(input: UpdaterInput): Promise<Planned> {
  const market = input.codeType === 'MARKET';
  const supplier = market ? MARKET_SUPPLIER : MANAGED_SUPPLIER;
  const codeOf = (sku: string) => (market ? MARKET_CODE_PREFIX + sku : sku);
  const tiles = Array.from(new Set(input.rows.map(rowTile)));
  const providers = tiles.flatMap((t) => (t.operator ? [t.operator] : []));
  const codes = input.rows.map((r) => codeOf(r.sku));
  // each mode only manages (and deactivates) its own packages
  const retire = market ? [] : input.retireMarketFor.filter((p) => providers.includes(p));
  const existingRows = await prisma.package.findMany({
    where: {
      OR: [
        { code: { in: codes } },
        ...tiles.map((t) => ({ supplierName: supplier, ...tileScope(t) })),
        ...(retire.length ? [{ supplierName: MARKET_SUPPLIER, provider: { in: retire }, isActive: true }] : []),
      ],
    },
  });
  const byCode = new Map(existingRows.map((p) => [p.code, p]));

  const rows: PreviewRow[] = [];
  const upserts: Planned['upserts'] = [];
  const seen = new Set<string>();
  const seenCodes = new Set<string>();
  const categoryLabels: Record<string, string> = {};
  const sortByTile: Record<string, number> = {};

  for (const r of input.rows) {
    const tile = rowTile(r);
    const provider = tile.operator ?? null;
    const category = categoryKey(tile.key, r.category);
    const label = categoryLabel(r.category);
    categoryLabels[category] = label;
    const code = codeOf(r.sku);
    const existing = byCode.get(code) ?? null;
    const base: PreviewRow = {
      sku: r.sku,
      tile: tile.key,
      provider,
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
    seenCodes.add(code);
    if (!SKU_RE.test(r.sku) || code.length > 40) {
      rows.push({ ...base, error: 'Kode produk hanya boleh huruf/angka/_-. (maks. 40 karakter)' });
      continue;
    }
    if (r.cost <= 0) {
      rows.push({ ...base, error: 'Harga kosong / tidak valid' });
      continue;
    }
    if (existing && existing.supplierName !== supplier) {
      rows.push({ ...base, error: `Kode sudah dipakai paket lain (${existing.name})` });
      continue;
    }

    const locked = r.agentPrice ? true : existing?.priceLocked ?? false;
    const agentPrice = r.agentPrice ?? (locked && existing ? existing.hargaAgen : agentPriceFor(r.cost, input.rule));
    sortByTile[tile.key] = (sortByTile[tile.key] ?? 0) + 1;
    const data: Prisma.PackageCreateInput = {
      code,
      name: r.name,
      description: r.description || null,
      category,
      provider,
      hargaAgen: agentPrice,
      hargaBeli: r.cost,
      supplierName: supplier,
      // market products keep an OtomaX code an admin assigned later (that switches them to automatic)
      supplierSku: market ? existing?.supplierSku ?? null : r.sku,
      priceLocked: locked,
      isActive: true,
      sortOrder: sortByTile[tile.key],
    };

    let status: RowStatus = 'NEW';
    if (existing) {
      const priceChanged = existing.hargaBeli !== r.cost || existing.hargaAgen !== agentPrice;
      const detailsChanged =
        existing.name !== data.name ||
        (existing.description ?? null) !== data.description ||
        existing.category !== category ||
        existing.provider !== provider ||
        existing.sortOrder !== data.sortOrder ||
        existing.priceLocked !== locked;
      status = !existing.isActive ? 'REACTIVATED' : priceChanged ? 'PRICE_CHANGED' : detailsChanged ? 'DETAILS_CHANGED' : 'UNCHANGED';
    }
    const warnings: string[] = [];
    if (agentPrice <= r.cost) warnings.push(`Harga agen ${formatRp(agentPrice)} tidak di atas modal ${formatRp(r.cost)}`);
    if (locked && !r.agentPrice) warnings.push('Harga terkunci (diatur manual), tidak ikut margin');
    rows.push({ ...base, status, agentPrice, priceLocked: locked, warnings });
    upserts.push({ existing, tile: tile.key, data });
  }

  const deactivate = existingRows.filter(
    (p) =>
      p.isActive &&
      ((p.supplierName === supplier && tiles.some((t) => inTile(p, t)) && !seenCodes.has(p.code)) ||
        (p.supplierName === MARKET_SUPPLIER && !!p.provider && retire.includes(p.provider))),
  );
  for (const p of deactivate) {
    rows.push({
      sku: p.code,
      tile: (tiles.find((t) => inTile(p, t)) ?? PRODUCT_TILES[p.provider!]).key,
      provider: p.provider,
      name: p.name,
      category: p.category,
      categoryLabel: p.category,
      status: 'DEACTIVATED',
      cost: null,
      oldCost: p.hargaBeli,
      agentPrice: null,
      oldAgentPrice: p.hargaAgen,
      priceLocked: p.priceLocked,
      warnings: [p.supplierName === supplier ? 'Tidak ada di file: disembunyikan dari aplikasi' : 'Produk pasar (manual) diganti produk OtomaX'],
      error: null,
    });
  }
  return { rows, upserts, deactivate, tiles, categoryLabels };
}

function summarize(rows: PreviewRow[]) {
  const counts: Record<RowStatus, number> = { NEW: 0, PRICE_CHANGED: 0, DETAILS_CHANGED: 0, UNCHANGED: 0, REACTIVATED: 0, DEACTIVATED: 0, ERROR: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

export async function previewUpdate(input: UpdaterInput) {
  const p = await plan(input);
  return { rows: p.rows, summary: summarize(p.rows), tiles: await projectTiles(p) };
}

// ---- app tiles ----

interface TileCategory {
  key: string;
  label: string;
  count: number;
  minPrice: number;
}

/** Tree text fields are capped at 80 chars. */
const clip = (t: string, max = 80) => (t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`);
/** ListNode allows 50 rows: 49 categories + a "Kategori lainnya" row to the next page. */
const ROWS_PER_PAGE = 49;

const ID_FIELDS: Record<Exclude<ProductTile['input'], 'OPERATOR_PHONE' | 'PHONE'>, { placeholder: string; regex: string; minLength: number; maxLength: number }> = {
  METER: { placeholder: '11–12 digit', regex: '^[0-9]{11,12}$', minLength: 11, maxLength: 12 },
  CARD: { placeholder: '16 digit', regex: '^[0-9]{16}$', minLength: 16, maxLength: 16 },
  GAME_ID: { placeholder: 'contoh: 123456789', regex: '^[0-9]{4,20}$', minLength: 4, maxLength: 20 },
  GAME_ID_ZONE: { placeholder: 'contoh: 123456789', regex: '^[0-9]{4,20}$', minLength: 4, maxLength: 20 },
};

/** The tile's first node: a phone (locked to the operator on operator tiles) or the id OtomaX needs as dest. */
function inputNode(t: ProductTile, childId: string): TreeNode {
  if (t.input === 'OPERATOR_PHONE' || t.input === 'PHONE') {
    return {
      id: 'phone',
      type: 'PhoneNumberInput',
      title: t.label,
      label: t.inputLabel,
      allowedProviders: t.operator ? [t.operator] : null,
      branches: {},
      defaultChildId: childId,
    };
  }
  const f = ID_FIELDS[t.input];
  return {
    id: 'idinput',
    type: 'CustomerIdInput',
    title: t.label,
    fields: [
      { key: 'customerId', label: t.inputLabel, placeholder: f.placeholder, regex: f.regex, minLength: f.minLength, maxLength: f.maxLength, keyboard: 'numeric', required: true },
      ...(t.input === 'GAME_ID_ZONE'
        ? [{ key: 'secondaryId' as const, label: 'Zone ID', placeholder: 'contoh: 1234', regex: '^[0-9]{2,6}$', minLength: 2, maxLength: 6, keyboard: 'numeric' as const, required: true }]
        : []),
    ],
    nextId: childId,
  };
}

/**
 * Tree: input → category list (paged when > 50; skipped on non-operator tiles with one category) → packages of that category.
 */
export function buildTileTree(t: ProductTile, categories: TileCategory[]): SegmentTree {
  const pages = Math.max(1, Math.ceil(categories.length / ROWS_PER_PAGE));
  const pageId = (i: number) => (i === 0 ? 'cat' : `cat_${i + 1}`);
  // operator tiles always list their categories (their trees stay stable as categories come and go)
  const single = !t.operator && categories.length === 1;
  const input = inputNode(t, single ? nodeId('pk', categories[0].key) : 'cat');
  const nodes: SegmentTree['nodes'] = { [input.id]: input };
  for (let i = 0; !single && i < pages; i++) {
    const slice = categories.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE);
    const rows = slice.map((c) => ({
      id: nodeId('r', c.key),
      label: clip(c.label),
      sublabel: `${c.count} paket · mulai ${formatRp(c.minPrice)}`,
      childId: nodeId('pk', c.key),
      isActive: true,
    }));
    if (i < pages - 1) {
      const rest = categories.length - (i + 1) * ROWS_PER_PAGE;
      rows.push({ id: `r_more_${i + 2}`, label: 'Kategori lainnya…', sublabel: `${rest} kategori lagi`, childId: pageId(i + 1), isActive: true });
    }
    nodes[pageId(i)] = { id: pageId(i), type: 'ListNode', title: i === 0 ? 'Pilih Kategori' : `Pilih Kategori (${i + 1})`, rows };
  }
  for (const c of categories) {
    nodes[nodeId('pk', c.key)] = {
      id: nodeId('pk', c.key),
      type: 'PackagesList',
      title: clip(single ? t.label : `${t.brand} · ${c.label}`),
      source: { kind: 'CATEGORY', category: c.key },
      nextId: null,
    };
  }
  return { schemaVersion: 1, rootId: input.id, nodes } as SegmentTree;
}

/** Active packages (sorted) → tile categories in first-appearance order. */
function groupCategories(t: ProductTile, pkgs: { category: string; hargaAgen: number }[], labels: Record<string, string>): TileCategory[] {
  const categories: TileCategory[] = [];
  for (const p of pkgs) {
    let c = categories.find((x) => x.key === p.category);
    if (!c) {
      c = { key: p.category, label: labels[p.category] ?? categoryLabel(p.category.replace(`${t.key}_`, '').replace(/_/g, ' ')), count: 0, minPrice: p.hargaAgen };
      categories.push(c);
    }
    c.count++;
    c.minPrice = Math.min(c.minPrice, p.hargaAgen);
  }
  return categories;
}

/**
 * Category labels of a published tile tree (category → row label). Categories not in
 * the uploaded file (e.g. market products on an OtomaX import) keep these names.
 */
function publishedLabels(tree: unknown): Record<string, string> {
  const nodes = (tree as SegmentTree | null)?.nodes;
  if (!nodes) return {};
  const labels: Record<string, string> = {};
  for (const n of Object.values(nodes)) {
    if (n.type !== 'ListNode') continue;
    for (const r of n.rows) {
      const child = nodes[r.childId];
      if (child?.type === 'PackagesList' && child.source.kind === 'CATEGORY') labels[child.source.category] = r.label;
    }
  }
  return labels;
}

/**
 * The tiles as they would look after applying `p`, validated up front so an
 * apply never commits packages whose tile tree cannot be published.
 */
async function projectTiles(p: Planned) {
  const tiles = [];
  for (const t of p.tiles) {
    const current = await prisma.package.findMany({
      where: { ...tileScope(t), supplierName: { in: MANAGED_SUPPLIERS }, isActive: true },
      select: { code: true, category: true, hargaAgen: true, sortOrder: true, supplierName: true },
    });
    const byCode = new Map(current.map((c) => [c.code, c]));
    for (const d of p.deactivate) byCode.delete(d.code);
    for (const u of p.upserts) {
      if (u.tile !== t.key) continue;
      byCode.set(u.data.code, { code: u.data.code, category: u.data.category, hargaAgen: u.data.hargaAgen, sortOrder: u.data.sortOrder ?? 0, supplierName: u.data.supplierName ?? null });
    }
    const pkgs = [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    const segment = await prisma.segment.findUnique({ where: { slug: t.slug }, include: { publishedVersion: true } });
    const categories = groupCategories(t, pkgs, { ...publishedLabels(segment?.publishedVersion?.tree), ...p.categoryLabels });
    const errors = categories.length
      ? validateTreeStructure(buildTileTree(t, categories), { strict: false })
          .filter((e) => e.severity === 'error')
          .map((e) => `${e.nodeId ?? ''} ${e.field ?? ''}: ${e.message}`.trim())
      : [];
    const marketProducts = pkgs.filter((x) => x.supplierName === MARKET_SUPPLIER).length;
    tiles.push({ tile: t.key, provider: t.operator ?? null, label: t.label, slug: t.slug, categories: categories.length, products: pkgs.length, marketProducts, errors });
  }
  return tiles;
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

/** Ensures the tile's segment exists and publishes a new tree version when it changed. */
async function syncTileSegment(adminId: string, t: ProductTile, categoryLabels: Record<string, string>) {
  const active = await prisma.package.findMany({
    where: { ...tileScope(t), supplierName: { in: MANAGED_SUPPLIERS }, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { category: true, hargaAgen: true },
  });
  const slug = t.slug;
  const tile = t.key;
  let segment = await prisma.segment.findUnique({ where: { slug }, include: { publishedVersion: true } });
  if (active.length === 0) {
    if (segment?.isActive) await prisma.segment.update({ where: { id: segment.id }, data: { isActive: false } });
    return { tile, slug, published: false, categories: 0 };
  }
  const categories = groupCategories(t, active, { ...publishedLabels(segment?.publishedVersion?.tree), ...categoryLabels });
  const tree = buildTileTree(t, categories);
  if (!segment) {
    await createSegment({ slug, label: t.label, iconUrl: t.icon, groupLabel: t.groupLabel, isActive: true });
    segment = await prisma.segment.findUniqueOrThrow({ where: { slug }, include: { publishedVersion: true } });
  }
  const unchanged = canonical(segment.publishedVersion?.tree ?? null) === canonical(tree);
  if (!segment.isActive) await prisma.segment.update({ where: { id: segment.id }, data: { isActive: true } });
  if (unchanged) return { tile, slug, published: false, categories: categories.length };
  await saveDraft(adminId, segment.id, tree);
  const published = await publishSegment(adminId, segment.id);
  return { tile, slug, published: true, version: published.publishedVersion?.version ?? null, categories: categories.length };
}

export async function applyUpdate(adminId: string, input: UpdaterInput) {
  const p = await plan(input);
  const summary = summarize(p.rows);
  const tiles = await projectTiles(p);
  const broken = tiles.filter((t) => t.errors.length);
  if (broken.length) {
    throw badRequest(`Tile ${broken.map((t) => t.slug).join(', ')} tidak valid: ${broken[0].errors[0]}`, 'TILE_INVALID', { tiles });
  }
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
  for (const t of p.tiles) segments.push(await syncTileSegment(adminId, t, p.categoryLabels));

  const record = await prisma.productUpdate.create({
    data: { adminId, fileName: input.fileName, summary: { counts: summary, rule: input.rule, codeType: input.codeType, tiles: p.tiles.map((t) => t.key), retireMarketFor: input.retireMarketFor, segments } as Prisma.InputJsonValue },
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
