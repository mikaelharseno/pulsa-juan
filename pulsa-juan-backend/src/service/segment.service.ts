import {
  hasBlockingErrors,
  outgoingIds,
  SegmentTree,
  TreeError,
  TreeNode,
  validateTreeStructure,
} from 'pulsa-juan-common';
import { z } from 'zod';

import { Agent, Prisma, Segment } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, notFound } from '../lib/errors';
import { randomNodeId } from '../lib/ids';
import { audit } from './audit.service';
import { packagesForTree } from './package.service';
import { resolveMarkup } from './referral.service';

export const segmentSchema = z.object({
  slug: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, 'Slug hanya huruf kecil/angka/-'),
  label: z.string().trim().min(1).max(40),
  iconUrl: z.string().trim().max(500).optional().nullable(),
  groupLabel: z.string().trim().max(40).optional().nullable(),
  badge: z.string().trim().max(12).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  maintenanceMessage: z.string().trim().max(200).optional().nullable(),
});

export const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });
export const duplicateSchema = z.object({
  targetSegmentId: z.string().optional(),
  newSlug: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/).optional(),
  newLabel: z.string().trim().min(1).max(40).optional(),
});

const publishedInclude = { publishedVersion: { select: { id: true, version: true, publishedAt: true } } } as const;

// ---- agent side ----

export async function listSegmentsForAgent() {
  const rows = await prisma.segment.findMany({
    where: { isActive: true, publishedVersionId: { not: null } },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    select: { id: true, slug: true, label: true, iconUrl: true, groupLabel: true, badge: true, maintenanceMessage: true },
  });
  const groups: { groupLabel: string; segments: typeof rows }[] = [];
  for (const row of rows) {
    const key = row.groupLabel ?? '';
    let g = groups.find((x) => x.groupLabel === key);
    if (!g) {
      g = { groupLabel: key, segments: [] };
      groups.push(g);
    }
    g.segments.push(row);
  }
  return { segments: rows, groups };
}

export async function treeForAgent(agent: Agent, segmentId: string) {
  const segment = await prisma.segment.findFirst({
    where: { OR: [{ id: segmentId }, { slug: segmentId }], isActive: true },
    include: { publishedVersion: true },
  });
  if (!segment || !segment.publishedVersion) throw notFound('Layanan tidak ditemukan');
  const tree = segment.publishedVersion.tree as unknown as SegmentTree;
  const [packages, markup] = await Promise.all([packagesForTree(tree), resolveMarkup(agent.id)]);
  return {
    segment: {
      id: segment.id,
      slug: segment.slug,
      label: segment.label,
      iconUrl: segment.iconUrl,
      maintenanceMessage: segment.maintenanceMessage,
    },
    treeVersion: segment.publishedVersion.version,
    treeVersionId: segment.publishedVersion.id,
    tree,
    packages,
    markupTotal: markup.markupTotal,
  };
}

// ---- admin side ----

export async function adminListSegments() {
  return prisma.segment.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], include: publishedInclude });
}

export async function adminGetSegment(id: string) {
  const seg = await prisma.segment.findUnique({ where: { id }, include: { publishedVersion: true } });
  if (!seg) throw notFound('Segmen tidak ditemukan');
  const tree = (seg.draftTree ?? seg.publishedVersion?.tree ?? null) as unknown as SegmentTree | null;
  const packages = tree ? await packagesForTree(tree) : {};
  return { ...seg, packages };
}

export async function createSegment(input: z.infer<typeof segmentSchema>) {
  const exists = await prisma.segment.findUnique({ where: { slug: input.slug } });
  if (exists) throw conflict('Slug sudah dipakai');
  const max = await prisma.segment.aggregate({ _max: { sortOrder: true } });
  return prisma.segment.create({
    data: { ...input, sortOrder: input.sortOrder ?? (max._max.sortOrder ?? 0) + 1, isActive: input.isActive ?? false },
    include: publishedInclude,
  });
}

export async function updateSegment(id: string, input: Partial<z.infer<typeof segmentSchema>>) {
  if (input.slug) {
    const exists = await prisma.segment.findUnique({ where: { slug: input.slug } });
    if (exists && exists.id !== id) throw conflict('Slug sudah dipakai');
  }
  return prisma.segment.update({ where: { id }, data: input, include: publishedInclude });
}

/** Given ids come first in that order; the rest keep their relative order after them. */
export async function reorderSegments(ids: string[]) {
  const all = await prisma.segment.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { id: true } });
  const order = [...ids.filter((id) => all.some((s) => s.id === id)), ...all.map((s) => s.id).filter((id) => !ids.includes(id))];
  await prisma.$transaction(order.map((id, i) => prisma.segment.update({ where: { id }, data: { sortOrder: i + 1 } })));
  return adminListSegments();
}

export async function deleteSegment(id: string) {
  const used = await prisma.transaction.count({ where: { segmentId: id } });
  if (used > 0) throw badRequest('Segmen sudah punya transaksi; nonaktifkan saja');
  await prisma.$transaction(async (tx) => {
    await tx.segment.update({ where: { id }, data: { publishedVersionId: null } });
    await tx.segmentTreeVersion.deleteMany({ where: { segmentId: id } });
    await tx.segment.delete({ where: { id } });
  });
}

export interface ValidationReport {
  ok: boolean;
  errors: TreeError[];
}

export async function validateTree(tree: unknown, strict: boolean): Promise<ValidationReport> {
  const structural = validateTreeStructure(tree, { strict });
  if (hasBlockingErrors(structural)) return { ok: false, errors: structural };
  const packages = await packagesForTree(tree as SegmentTree);
  const errors = validateTreeStructure(tree, { strict, packages });
  return { ok: !hasBlockingErrors(errors), errors };
}

export async function saveDraft(adminId: string, id: string, tree: unknown) {
  const seg = await prisma.segment.findUnique({ where: { id } });
  if (!seg) throw notFound('Segmen tidak ditemukan');
  const report = await validateTree(tree, false);
  if (!report.ok) throw badRequest('Draf belum valid', 'TREE_INVALID', { errors: report.errors });
  const updated = await prisma.segment.update({
    where: { id },
    data: { draftTree: tree as Prisma.InputJsonValue, draftUpdatedAt: new Date() },
    include: publishedInclude,
  });
  await audit(adminId, 'SEGMENT_SAVE_DRAFT', 'Segment', id);
  return { segment: updated, warnings: report.errors };
}

export async function publishSegment(adminId: string, id: string) {
  const seg = await prisma.segment.findUnique({ where: { id }, include: { publishedVersion: true } });
  if (!seg) throw notFound('Segmen tidak ditemukan');
  if (!seg.draftTree) throw badRequest('Belum ada draf untuk dipublikasikan');
  const report = await validateTree(seg.draftTree, true);
  if (!report.ok) throw badRequest('Draf belum valid untuk dipublikasikan', 'TREE_INVALID', { errors: report.errors });
  const last = await prisma.segmentTreeVersion.aggregate({ where: { segmentId: id }, _max: { version: true } });
  const version = (last._max.version ?? 0) + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.segmentTreeVersion.create({
      data: { segmentId: id, version, tree: seg.draftTree as Prisma.InputJsonValue, publishedBy: adminId },
    });
    return tx.segment.update({ where: { id }, data: { publishedVersionId: v.id }, include: publishedInclude });
  });
  await audit(adminId, 'SEGMENT_PUBLISH', 'Segment', id, { version });
  return updated;
}

export async function listVersions(id: string) {
  return prisma.segmentTreeVersion.findMany({
    where: { segmentId: id },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, publishedAt: true, publishedBy: true },
  });
}

export async function restoreVersion(adminId: string, id: string, versionId: string) {
  const v = await prisma.segmentTreeVersion.findFirst({ where: { id: versionId, segmentId: id } });
  if (!v) throw notFound('Versi tidak ditemukan');
  const updated = await prisma.segment.update({
    where: { id },
    data: { draftTree: v.tree as Prisma.InputJsonValue, draftUpdatedAt: new Date() },
    include: publishedInclude,
  });
  await audit(adminId, 'SEGMENT_RESTORE_VERSION', 'Segment', id, { version: v.version });
  return updated;
}

export async function discardDraft(id: string) {
  const seg = await prisma.segment.findUnique({ where: { id }, include: { publishedVersion: true } });
  if (!seg) throw notFound('Segmen tidak ditemukan');
  return prisma.segment.update({
    where: { id },
    data: { draftTree: (seg.publishedVersion?.tree as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull, draftUpdatedAt: null },
    include: publishedInclude,
  });
}

/** Deep copy with every node id remapped so two segments never share ids by accident. */
export function remapTree(tree: SegmentTree): SegmentTree {
  const map: Record<string, string> = {};
  for (const id of Object.keys(tree.nodes)) map[id] = randomNodeId();
  const nodes: Record<string, TreeNode> = {};
  for (const [id, node] of Object.entries(tree.nodes)) {
    const copy = JSON.parse(JSON.stringify(node)) as TreeNode;
    copy.id = map[id];
    switch (copy.type) {
      case 'ListNode':
        copy.rows = copy.rows.map((r) => ({ ...r, childId: map[r.childId] ?? r.childId }));
        break;
      case 'PhoneNumberInput':
        copy.branches = Object.fromEntries(Object.entries(copy.branches).map(([p, c]) => [p, c ? map[c] ?? c : c]));
        copy.defaultChildId = copy.defaultChildId ? map[copy.defaultChildId] ?? copy.defaultChildId : null;
        break;
      default:
        copy.nextId = copy.nextId ? map[copy.nextId] ?? copy.nextId : null;
    }
    nodes[copy.id] = copy;
  }
  // sanity: every outgoing id must still resolve
  for (const n of Object.values(nodes)) for (const o of outgoingIds(n)) if (!nodes[o]) throw new Error('remap failed');
  return { schemaVersion: 1, rootId: map[tree.rootId], nodes };
}

export async function duplicateSegment(adminId: string, id: string, input: z.infer<typeof duplicateSchema>) {
  const src = await prisma.segment.findUnique({ where: { id }, include: { publishedVersion: true } });
  if (!src) throw notFound('Segmen tidak ditemukan');
  const source = (src.draftTree ?? src.publishedVersion?.tree) as unknown as SegmentTree | null;
  if (!source) throw badRequest('Segmen sumber belum punya alur');
  const tree = remapTree(source) as unknown as Prisma.InputJsonValue;
  let result: Segment;
  if (input.targetSegmentId) {
    result = await prisma.segment.update({ where: { id: input.targetSegmentId }, data: { draftTree: tree, draftUpdatedAt: new Date() } });
  } else {
    const slug = input.newSlug ?? `${src.slug}-copy`;
    const exists = await prisma.segment.findUnique({ where: { slug } });
    if (exists) throw conflict('Slug sudah dipakai');
    const max = await prisma.segment.aggregate({ _max: { sortOrder: true } });
    result = await prisma.segment.create({
      data: {
        slug,
        label: input.newLabel ?? `${src.label} (salinan)`,
        iconUrl: src.iconUrl,
        groupLabel: src.groupLabel,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        isActive: false,
        draftTree: tree,
        draftUpdatedAt: new Date(),
      },
    });
  }
  await audit(adminId, 'SEGMENT_DUPLICATE', 'Segment', id, { targetSegmentId: result.id });
  return result;
}
