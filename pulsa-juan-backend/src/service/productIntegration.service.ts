import { PRODUCT_TILES } from 'pulsa-juan-common';

import { prisma } from '../../prisma/client';
import { listBillers } from './bill.service';
import { otomaxEnabled, providerFor } from './fulfillment';
import { otomaxConfig } from './fulfillment/otomax';

// Read-only "is this product automatic?" overview for the dashboard. Uses the
// same rules as ordering: providerFor (packages) and billerUsable (bills).

export type ProductMode = 'AUTO' | 'MANUAL' | 'INACTIVE';
/** why a product has its mode */
export type ProductReason = 'OTOMAX' | 'NO_SKU' | 'OTOMAX_OFF' | 'INACTIVE' | 'NO_CODE';

export const HEALTH_DAYS = 30;
const OTHER_TILE = { key: 'OTHER', label: 'Lainnya', groupLabel: 'Lainnya' };

const TILE_KEYS = Object.keys(PRODUCT_TILES).sort((a, b) => b.length - a.length);

/** App tile of a package: category prefix (INDOSAT_DATA_HARIAN → INDOSAT), else its operator. */
export function tileKeyFor(category: string, provider: string | null): string {
  const byCategory = TILE_KEYS.find((k) => category === k || category.startsWith(k + '_'));
  if (byCategory) return byCategory;
  if (provider && PRODUCT_TILES[provider]) return provider;
  return OTHER_TILE.key;
}

export function packageMode(p: { isActive: boolean; supplierSku: string | null }): { mode: ProductMode; reason: ProductReason } {
  if (!p.isActive) return { mode: 'INACTIVE', reason: 'INACTIVE' };
  if (providerFor(p).mode === 'AUTO') return { mode: 'AUTO', reason: 'OTOMAX' };
  return { mode: 'MANUAL', reason: p.supplierSku ? 'OTOMAX_OFF' : 'NO_SKU' };
}

interface HealthRow {
  packageId: string;
  success: number;
  failed: number;
  pending: number;
  lastStatus: string;
  lastAt: Date;
  lastMessage: string | null;
}

/** OtomaX orders of the last HEALTH_DAYS days, per package (one grouped query). */
async function otomaxHealth() {
  const since = new Date(Date.now() - HEALTH_DAYS * 86400_000);
  const rows = await prisma.$queryRaw<HealthRow[]>`
    SELECT t."packageId",
           count(*) FILTER (WHERE t.status IN ('SUCCESS','REFUNDED'))::int AS success,
           count(*) FILTER (WHERE t.status = 'FAILED')::int AS failed,
           count(*) FILTER (WHERE t.status = 'PENDING')::int AS pending,
           (array_agg(t.status::text ORDER BY t."createdAt" DESC))[1] AS "lastStatus",
           max(t."createdAt") AS "lastAt",
           (array_agg(coalesce(t."failReason", t."supplierMessage") ORDER BY t."createdAt" DESC))[1] AS "lastMessage"
      FROM "Transaction" t
     WHERE t.provider = 'otomax' AND t."packageId" IS NOT NULL AND t."createdAt" >= ${since}
     GROUP BY t."packageId"`;
  return new Map(rows.map((r) => [r.packageId, r]));
}

export async function productIntegrationStatus() {
  const otomax = otomaxConfig();
  const [packages, health, billers] = await Promise.all([
    prisma.package.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, category: true, provider: true, supplierName: true, supplierSku: true, isActive: true },
    }),
    otomaxHealth(),
    listBillers(),
  ]);

  const tiles = new Map<string, { key: string; label: string; groupLabel: string; AUTO: number; MANUAL: number; INACTIVE: number; total: number }>();
  const totals = { AUTO: 0, MANUAL: 0, INACTIVE: 0, total: 0 };
  const rows = packages.map((p) => {
    const { mode, reason } = packageMode(p);
    const tileKey = tileKeyFor(p.category, p.provider);
    const t = PRODUCT_TILES[tileKey] ?? OTHER_TILE;
    const agg = tiles.get(tileKey) ?? { key: tileKey, label: t.label, groupLabel: t.groupLabel, AUTO: 0, MANUAL: 0, INACTIVE: 0, total: 0 };
    agg[mode]++;
    agg.total++;
    tiles.set(tileKey, agg);
    totals[mode]++;
    totals.total++;
    const h = health.get(p.id);
    return {
      ...p,
      tile: tileKey,
      mode,
      reason,
      health: h ? { success: h.success, failed: h.failed, pending: h.pending, lastStatus: h.lastStatus, lastAt: h.lastAt, lastMessage: h.lastMessage } : null,
    };
  });

  const tileOrder = Object.keys(PRODUCT_TILES);
  const rank = (k: string) => (k === OTHER_TILE.key ? 999 : tileOrder.indexOf(k));

  return {
    otomax: { enabled: otomaxEnabled(), host: otomax ? new URL(otomax.url).host : null },
    healthDays: HEALTH_DAYS,
    totals,
    tiles: [...tiles.values()].sort((a, b) => rank(a.key) - rank(b.key)),
    packages: rows,
    billers: billers.map((b) => {
      const usable = b.usable; // billerUsable, as the app's bill check
      const reason: ProductReason = usable ? 'OTOMAX' : !b.isActive ? 'INACTIVE' : !b.checkCode || !b.payCode ? 'NO_CODE' : 'OTOMAX_OFF';
      return {
        id: b.id,
        key: b.key,
        name: b.name,
        checkCode: b.checkCode,
        payCode: b.payCode,
        isActive: b.isActive,
        mode: (usable ? 'AUTO' : 'INACTIVE') as ProductMode,
        reason,
        lastCheck: b.lastCheck ? { status: b.lastCheck.status, at: b.lastCheck.createdAt } : null,
      };
    }),
  };
}
