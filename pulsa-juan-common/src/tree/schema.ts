import { z } from 'zod';

import {
  NodeId,
  PackagePublic,
  PROVIDERS,
  SegmentTree,
  TreeError,
  TreeNode,
} from './types';
import { isPriceable, outgoingIds } from './walk';

// ---- per-node structural schemas (zod) ----

const nodeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'ID node hanya boleh huruf, angka, _ dan -');
const shortText = z.string().trim().min(1, 'Wajib diisi').max(80, 'Maksimal 80 karakter');
const optionalText = z.string().trim().max(200).optional();
const money = z.number().int('Harus bilangan bulat').min(0, 'Tidak boleh negatif');

const baseShape = {
  id: nodeIdSchema,
  title: shortText,
  subtitle: optionalText,
};

const listRowSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: shortText,
  sublabel: optionalText,
  imageUrl: z.string().trim().max(500).optional(),
  childId: nodeIdSchema,
  isActive: z.boolean(),
});

const listNodeBase = z.object({ ...baseShape, type: z.literal('ListNode'), rows: z.array(listRowSchema).min(1, 'Minimal satu baris').max(50) });
export const listNodeSchema = listNodeBase.superRefine((node, ctx) => {
    const seen = new Set<string>();
    node.rows.forEach((row, i) => {
      if (seen.has(row.id)) ctx.addIssue({ code: 'custom', path: ['rows', i, 'id'], message: `ID baris "${row.id}" duplikat` });
      seen.add(row.id);
    });
  });

const packagesSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('IDS'), packageIds: z.array(z.string().min(1)).min(1, 'Pilih minimal satu paket').max(200) }),
  z.object({ kind: z.literal('CATEGORY'), category: z.string().trim().min(1, 'Kategori wajib diisi').max(60) }),
]);

export const packagesListSchema = z.object({
  ...baseShape,
  type: z.literal('PackagesList'),
  source: packagesSourceSchema,
  nextId: nodeIdSchema.nullable(),
});

const providerSchema = z.enum(PROVIDERS);
const branchesSchema = z.object(
  Object.fromEntries(PROVIDERS.map((p) => [p, nodeIdSchema.optional()])) as Record<
    (typeof PROVIDERS)[number],
    z.ZodOptional<typeof nodeIdSchema>
  >,
);

const phoneNumberInputBase = z.object({
  ...baseShape,
  type: z.literal('PhoneNumberInput'),
  label: shortText,
  allowedProviders: z.array(providerSchema).min(1, 'Pilih minimal satu operator').nullable(),
  branches: branchesSchema,
  defaultChildId: nodeIdSchema.nullable(),
});
export const phoneNumberInputSchema = phoneNumberInputBase.superRefine((node, ctx) => {
    if (node.allowedProviders) {
      for (const p of PROVIDERS) {
        if (node.branches[p] && !node.allowedProviders.includes(p)) {
          ctx.addIssue({ code: 'custom', path: ['branches', p], message: `Cabang ${p} tidak termasuk operator yang diizinkan` });
        }
      }
    }
  });

const enterAmountBase = z.object({
  ...baseShape,
  type: z.literal('EnterAmount'),
  label: shortText,
  min: money,
  max: money,
  step: z.number().int().min(1, 'Kelipatan minimal 1'),
  quickAmounts: z.array(money).max(8),
  adminFee: money,
  nextId: nodeIdSchema.nullable(),
});
export const enterAmountSchema = enterAmountBase.superRefine((node, ctx) => {
    if (node.min >= node.max) ctx.addIssue({ code: 'custom', path: ['max'], message: 'Maksimal harus lebih besar dari minimal' });
    node.quickAmounts.forEach((q, i) => {
      if (q < node.min || q > node.max || (q - node.min) % node.step !== 0) {
        ctx.addIssue({ code: 'custom', path: ['quickAmounts', i], message: `Nominal cepat ${q} di luar rentang/kelipatan` });
      }
    });
  });

const customerIdFieldSchema = z
  .object({
    key: z.enum(['customerId', 'secondaryId']),
    label: shortText,
    placeholder: optionalText,
    helpText: optionalText,
    regex: z
      .string()
      .max(200)
      .optional()
      .refine((r) => {
        if (!r) return true;
        try {
          new RegExp(r);
          return true;
        } catch {
          return false;
        }
      }, 'Regex tidak valid'),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    keyboard: z.enum(['numeric', 'default']),
    required: z.boolean(),
  })
  .superRefine((f, ctx) => {
    if (f.minLength !== undefined && f.maxLength !== undefined && f.minLength > f.maxLength) {
      ctx.addIssue({ code: 'custom', path: ['maxLength'], message: 'Panjang maksimal lebih kecil dari minimal' });
    }
  });

const customerIdInputBase = z.object({
  ...baseShape,
  type: z.literal('CustomerIdInput'),
  fields: z.array(customerIdFieldSchema).min(1).max(2),
  nextId: nodeIdSchema.nullable(),
});
export const customerIdInputSchema = customerIdInputBase.superRefine((node, ctx) => {
    if (node.fields[0]?.key !== 'customerId') {
      ctx.addIssue({ code: 'custom', path: ['fields', 0, 'key'], message: 'Field pertama harus customerId' });
    }
    if (node.fields.length === 2 && node.fields[1].key !== 'secondaryId') {
      ctx.addIssue({ code: 'custom', path: ['fields', 1, 'key'], message: 'Field kedua harus secondaryId' });
    }
  });

export const billInquirySchema = z.object({
  ...baseShape,
  type: z.literal('BillInquiry'),
  product: z.string().trim().min(1, 'Kode produk wajib diisi').max(60),
  adminFee: money,
  nextId: nodeIdSchema.nullable(),
});

// Structural union (zod discriminatedUnion needs plain objects); the per-type
// refinements in NODE_SCHEMAS are applied node-by-node in validateTreeStructure.
export const treeNodeSchema = z.discriminatedUnion('type', [
  listNodeBase,
  packagesListSchema,
  phoneNumberInputBase,
  enterAmountBase,
  customerIdInputBase,
  billInquirySchema,
]);

export const segmentTreeSchema = z.object({
  schemaVersion: z.literal(1),
  rootId: nodeIdSchema,
  nodes: z.record(z.string(), treeNodeSchema),
});

/** Schema for a single node, by type — used by the dashboard's per-node forms. */
export const NODE_SCHEMAS = {
  ListNode: listNodeSchema,
  PackagesList: packagesListSchema,
  PhoneNumberInput: phoneNumberInputSchema,
  EnterAmount: enterAmountSchema,
  CustomerIdInput: customerIdInputSchema,
  BillInquiry: billInquirySchema,
} as const;

// ---- graph checks ----

export interface ValidateOptions {
  /** Publish mode: unreachable nodes are errors, not warnings. */
  strict?: boolean;
  /** When given, PackagesList references are checked against it. */
  packages?: Record<string, PackagePublic>;
}

const MAX_DEPTH = 20;
const MAX_VISITS = 5000;

/**
 * Structural (zod) + graph validation. Pure, so it runs live in the dashboard
 * editor and again on the backend before draft save / publish.
 */
export function validateTreeStructure(input: unknown, opts: ValidateOptions = {}): TreeError[] {
  const parsed = segmentTreeSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => {
      const path = issue.path;
      const nodeId = path[0] === 'nodes' && typeof path[1] === 'string' ? path[1] : null;
      const field = nodeId ? path.slice(2).join('.') : path.join('.');
      return { nodeId, field: field || undefined, severity: 'error', message: issue.message };
    });
  }
  const tree = parsed.data as SegmentTree;
  const errors: TreeError[] = [];
  const seen = new Set<string>();
  const push = (e: TreeError) => {
    const key = `${e.nodeId}|${e.field ?? ''}|${e.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push(e);
    }
  };

  // per-type refinements (cross-field rules) that the union cannot carry
  for (const node of Object.values(tree.nodes)) {
    const refined = (NODE_SCHEMAS[node.type] as z.ZodTypeAny).safeParse(node);
    if (!refined.success) {
      for (const issue of refined.error.issues) {
        push({ nodeId: node.id, field: issue.path.join('.') || undefined, severity: 'error', message: issue.message });
      }
    }
  }
  if (errors.length) return errors;

  // ids must match their map key
  for (const [key, node] of Object.entries(tree.nodes)) {
    if (node.id !== key) push({ nodeId: key, field: 'id', severity: 'error', message: `ID node "${node.id}" tidak sama dengan kuncinya "${key}"` });
  }

  if (!tree.nodes[tree.rootId]) {
    push({ nodeId: null, field: 'rootId', severity: 'error', message: `Node awal "${tree.rootId}" tidak ditemukan` });
    return errors;
  }

  // dangling references
  for (const node of Object.values(tree.nodes)) {
    for (const ref of outgoingIds(node)) {
      if (!tree.nodes[ref]) push({ nodeId: node.id, severity: 'error', message: `Node "${node.id}" mengarah ke node "${ref}" yang tidak ada` });
    }
  }

  // per-node local checks
  for (const node of Object.values(tree.nodes)) {
    if (node.type === 'ListNode' && node.rows.every((r) => !r.isActive)) {
      push({ nodeId: node.id, field: 'rows', severity: 'error', message: `Semua baris pada node "${node.id}" nonaktif` });
    }
    if (node.type === 'PhoneNumberInput') {
      const hasBranches = Object.values(node.branches).some(Boolean);
      if (hasBranches && !node.defaultChildId) {
        const required = node.allowedProviders ?? [...PROVIDERS];
        for (const p of required) {
          if (!node.branches[p]) push({ nodeId: node.id, field: 'branches', severity: 'error', message: `Operator ${p} belum punya cabang dan tidak ada cabang default pada node "${node.id}"` });
        }
      }
    }
    if (node.type === 'PackagesList' && opts.packages) {
      if (node.source.kind === 'IDS') {
        for (const id of node.source.packageIds) {
          const pkg = opts.packages[id];
          if (!pkg) push({ nodeId: node.id, field: 'source', severity: 'error', message: `Paket "${id}" tidak ditemukan pada node "${node.id}"` });
          else if (!pkg.isActive) push({ nodeId: node.id, field: 'source', severity: 'warning', message: `Paket "${pkg.code}" sudah nonaktif pada node "${node.id}"` });
        }
      } else {
        const category = node.source.category;
        if (!Object.values(opts.packages).some((p) => p.category === category && p.isActive)) {
          push({ nodeId: node.id, field: 'source', severity: 'error', message: `Kategori "${category}" tidak punya paket aktif pada node "${node.id}"` });
        }
      }
    }
  }

  // path walk: cycles, depth, exactly-one-priceable, BillInquiry prerequisites
  const reachable = new Set<NodeId>();
  let visits = 0;
  const onPath = new Set<NodeId>();

  const visit = (id: NodeId, depth: number, priceable: number, hasCustomerInput: boolean, from: NodeId | null) => {
    visits++;
    if (visits > MAX_VISITS) return;
    const node: TreeNode | undefined = tree.nodes[id];
    if (!node) return; // dangling: reported above
    if (onPath.has(id)) {
      push({ nodeId: from ?? id, severity: 'error', message: `Terdeteksi alur berputar (siklus) pada node "${id}"` });
      return;
    }
    reachable.add(id);
    if (depth > MAX_DEPTH) {
      push({ nodeId: id, severity: 'error', message: `Alur terlalu dalam (>${MAX_DEPTH} layar) pada node "${id}"` });
      return;
    }
    let priceableCount = priceable;
    if (isPriceable(node)) {
      priceableCount++;
      if (priceableCount > 1) push({ nodeId: id, severity: 'error', message: `Node "${id}" menetapkan harga kedua pada alur yang sama` });
    }
    if (node.type === 'BillInquiry' && !hasCustomerInput) {
      push({ nodeId: id, severity: 'error', message: `Node "${id}" (Cek Tagihan) membutuhkan input ID pelanggan sebelumnya` });
    }
    const collects = hasCustomerInput || node.type === 'CustomerIdInput' || node.type === 'PhoneNumberInput';
    const children = outgoingIds(node).filter((c) => !!tree.nodes[c]);
    if (children.length === 0) {
      if (priceableCount === 0) push({ nodeId: id, severity: 'error', message: `Alur dari node "${id}" berakhir tanpa harga` });
      return;
    }
    onPath.add(id);
    for (const child of Array.from(new Set(children))) visit(child, depth + 1, priceableCount, collects, id);
    onPath.delete(id);
  };
  visit(tree.rootId, 1, 0, false, null);
  if (visits > MAX_VISITS) push({ nodeId: null, severity: 'error', message: 'Alur terlalu kompleks untuk divalidasi' });

  for (const id of Object.keys(tree.nodes)) {
    if (!reachable.has(id)) {
      push({ nodeId: id, severity: opts.strict ? 'error' : 'warning', message: `Node "${id}" tidak terhubung dari node awal` });
    }
  }
  return errors;
}

export function hasBlockingErrors(errors: TreeError[]): boolean {
  return errors.some((e) => e.severity === 'error');
}

/** Ids reachable from `rootId` (used by the editor's orphan section and delete-subtree). */
export function reachableIds(tree: SegmentTree, rootId: NodeId = tree.rootId): Set<NodeId> {
  const out = new Set<NodeId>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    const node = tree.nodes[id];
    if (!node) continue;
    out.add(id);
    stack.push(...outgoingIds(node));
  }
  return out;
}
