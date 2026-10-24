import { PackagePublic, PROVIDERS, SegmentTree } from 'pulsa-juan-common';
import { z } from 'zod';

import { Package, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict } from '../lib/errors';

export const packageSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_.-]+$/, 'Kode hanya huruf/angka/_-.'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().min(1).max(60),
  provider: z.enum(PROVIDERS).optional().nullable(),
  hargaAgen: z.number().int().min(0),
  hargaBeli: z.number().int().min(0).optional(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  supplierName: z.string().trim().max(60).optional().nullable(),
  supplierSku: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  /** keep hargaAgen when the Product Updater re-prices from a new sheet */
  priceLocked: z.boolean().optional(),
});

export function toPublic(p: Package): PackagePublic {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    category: p.category,
    provider: p.provider,
    hargaAgen: p.hargaAgen,
    imageUrl: p.imageUrl,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
  };
}

/** Every package a tree can show: explicit ids plus whole categories. */
export async function packagesForTree(tree: SegmentTree): Promise<Record<string, PackagePublic>> {
  const ids = new Set<string>();
  const categories = new Set<string>();
  for (const node of Object.values(tree.nodes)) {
    if (node.type !== 'PackagesList') continue;
    if (node.source.kind === 'IDS') node.source.packageIds.forEach((id) => ids.add(id));
    else categories.add(node.source.category);
  }
  if (ids.size === 0 && categories.size === 0) return {};
  const rows = await prisma.package.findMany({
    where: { OR: [{ id: { in: Array.from(ids) } }, { category: { in: Array.from(categories) } }] },
  });
  return Object.fromEntries(rows.map((p) => [p.id, toPublic(p)]));
}

export async function listPackages(filter: { category?: string; q?: string } = {}) {
  const where: Prisma.PackageWhereInput = {};
  if (filter.category) where.category = filter.category;
  if (filter.q) where.OR = [{ code: { contains: filter.q, mode: 'insensitive' } }, { name: { contains: filter.q, mode: 'insensitive' } }];
  return prisma.package.findMany({ where, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { hargaAgen: 'asc' }] });
}

export async function listCategories() {
  const rows = await prisma.package.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' } });
  return rows.map((r) => ({ category: r.category, count: r._count._all }));
}

export async function createPackage(input: z.infer<typeof packageSchema>) {
  const exists = await prisma.package.findUnique({ where: { code: input.code } });
  if (exists) throw conflict('Kode paket sudah ada');
  return prisma.package.create({ data: { ...input, hargaBeli: input.hargaBeli ?? 0 } });
}

export async function updatePackage(id: string, input: Partial<z.infer<typeof packageSchema>>) {
  if (input.code) {
    const exists = await prisma.package.findUnique({ where: { code: input.code } });
    if (exists && exists.id !== id) throw conflict('Kode paket sudah ada');
  }
  // a hand-edited agent price on an updater-managed package sticks across sheet uploads
  const current = await prisma.package.findUnique({ where: { id }, select: { hargaAgen: true, supplierName: true } });
  const data = { ...input };
  if (input.priceLocked === undefined && input.hargaAgen !== undefined && current?.supplierName === 'OtomaX' && input.hargaAgen !== current.hargaAgen) {
    data.priceLocked = true;
  }
  return prisma.package.update({ where: { id }, data });
}

export async function deletePackage(id: string) {
  const used = await prisma.transaction.count({ where: { packageId: id } });
  if (used > 0) throw badRequest('Paket sudah dipakai transaksi; nonaktifkan saja');
  await prisma.package.delete({ where: { id } });
}

/** CSV paste import: code,name,category,provider,hargaAgen,hargaBeli,sortOrder (header optional). Upserts by code. */
export async function importPackagesCsv(csv: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let imported = 0;
  const errors: string[] = [];
  for (const [i, line] of lines.entries()) {
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    if (i === 0 && /^code$/i.test(cols[0])) continue;
    const [code, name, category, provider, hargaAgen, hargaBeli, sortOrder] = cols;
    const parsed = packageSchema.safeParse({
      code,
      name,
      category,
      provider: provider || null,
      hargaAgen: Number(hargaAgen),
      hargaBeli: hargaBeli ? Number(hargaBeli) : 0,
      sortOrder: sortOrder ? Number(sortOrder) : 0,
    });
    if (!parsed.success) {
      errors.push(`Baris ${i + 1}: ${parsed.error.issues[0].message}`);
      continue;
    }
    await prisma.package.upsert({
      where: { code: parsed.data.code },
      update: { ...parsed.data, hargaBeli: parsed.data.hargaBeli ?? 0 },
      create: { ...parsed.data, hargaBeli: parsed.data.hargaBeli ?? 0 },
    });
    imported++;
  }
  return { imported, errors };
}
