import { formatRp } from '../formatRp';
import { detectProvider, isValidIndoMobile, normalizeIndonesianMobile } from '../phone';
import {
  ConfirmationRow,
  FlowStep,
  InquiryResult,
  NodeId,
  PackagePublic,
  PackagesList,
  PriceBreakdown,
  PRICEABLE_TYPES,
  PROVIDER_LABELS,
  SegmentTree,
  StepError,
  TreeNode,
  WalkContext,
} from './types';

export const MAX_STEPS = 20;

/** Every node id this node can navigate to. */
export function outgoingIds(node: TreeNode): NodeId[] {
  switch (node.type) {
    case 'ListNode':
      return node.rows.map((r) => r.childId);
    case 'PhoneNumberInput': {
      const ids = Object.values(node.branches).filter((v): v is NodeId => !!v);
      if (node.defaultChildId) ids.push(node.defaultChildId);
      return ids;
    }
    default:
      return node.nextId ? [node.nextId] : [];
  }
}

export function isLeaf(node: TreeNode): boolean {
  return outgoingIds(node).length === 0;
}

export function isPriceable(node: TreeNode): boolean {
  return PRICEABLE_TYPES.includes(node.type);
}

/** Ordered, active package ids a PackagesList node shows. */
export function resolvePackageIds(node: PackagesList, packages: Record<string, PackagePublic>): string[] {
  if (node.source.kind === 'IDS') {
    return node.source.packageIds.filter((id) => packages[id]?.isActive);
  }
  const category = node.source.category;
  return Object.values(packages)
    .filter((p) => p.category === category && p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.hargaAgen - b.hargaAgen)
    .map((p) => p.id);
}

/** Where the flow goes after `step` is committed on `node`; null = finished. */
export function resolveNext(node: TreeNode, step: FlowStep, ctx: WalkContext): NodeId | null {
  switch (node.type) {
    case 'ListNode': {
      if (step.type !== 'ListNode') return null;
      const row = node.rows.find((r) => r.id === step.rowId);
      return row ? row.childId : null;
    }
    case 'PhoneNumberInput': {
      if (step.type !== 'PhoneNumberInput') return null;
      const provider = detectProvider(normalizeIndonesianMobile(step.phoneNumber), ctx.prefixes);
      const branch = provider ? node.branches[provider] : undefined;
      return branch ?? node.defaultChildId;
    }
    default:
      return node.nextId;
  }
}

function invalid(nodeId: NodeId, message: string): StepError {
  return { nodeId, code: 'INVALID_INPUT', message };
}

/** Checks the agent's input for one node. `priorSteps` = steps before this one. */
export function validateStepInput(
  node: TreeNode,
  step: FlowStep,
  ctx: WalkContext,
  priorSteps: FlowStep[] = [],
): StepError | null {
  if (step.type !== node.type || step.nodeId !== node.id) {
    return { nodeId: node.id, code: 'ILLEGAL_PATH', message: 'Alur transaksi tidak valid' };
  }
  switch (node.type) {
    case 'ListNode': {
      if (step.type !== 'ListNode') break;
      const row = node.rows.find((r) => r.id === step.rowId);
      if (!row || !row.isActive) return invalid(node.id, 'Pilihan tidak tersedia');
      return null;
    }
    case 'PackagesList': {
      if (step.type !== 'PackagesList') break;
      if (!resolvePackageIds(node, ctx.packages).includes(step.packageId)) {
        return invalid(node.id, 'Paket tidak tersedia');
      }
      return null;
    }
    case 'PhoneNumberInput': {
      if (step.type !== 'PhoneNumberInput') break;
      const normalized = normalizeIndonesianMobile(step.phoneNumber);
      if (!isValidIndoMobile(normalized)) return invalid(node.id, 'Nomor HP tidak valid');
      const provider = detectProvider(normalized, ctx.prefixes);
      if (node.allowedProviders) {
        if (!provider || !node.allowedProviders.includes(provider)) {
          const names = node.allowedProviders.map((p) => PROVIDER_LABELS[p]).join('/');
          return invalid(node.id, `Nomor bukan nomor ${names}`);
        }
      } else if (!provider && Object.keys(node.branches).length > 0 && !node.defaultChildId) {
        return invalid(node.id, 'Operator nomor tidak dikenali');
      }
      return null;
    }
    case 'EnterAmount': {
      if (step.type !== 'EnterAmount') break;
      const a = step.amount;
      if (!Number.isInteger(a)) return invalid(node.id, 'Nominal harus bilangan bulat');
      if (a < node.min) return invalid(node.id, `Nominal minimal ${formatRp(node.min)}`);
      if (a > node.max) return invalid(node.id, `Nominal maksimal ${formatRp(node.max)}`);
      if ((a - node.min) % node.step !== 0) {
        return invalid(node.id, `Nominal harus kelipatan ${formatRp(node.step)}`);
      }
      return null;
    }
    case 'CustomerIdInput': {
      if (step.type !== 'CustomerIdInput') break;
      for (const field of node.fields) {
        const value = (step.values[field.key] ?? '').trim();
        if (!value) {
          if (field.required) return invalid(node.id, `${field.label} wajib diisi`);
          continue;
        }
        if (field.minLength !== undefined && value.length < field.minLength) {
          return invalid(node.id, `${field.label} minimal ${field.minLength} karakter`);
        }
        if (field.maxLength !== undefined && value.length > field.maxLength) {
          return invalid(node.id, `${field.label} maksimal ${field.maxLength} karakter`);
        }
        if (field.regex) {
          let re: RegExp;
          try {
            re = new RegExp(field.regex);
          } catch {
            return invalid(node.id, `${field.label}: format validasi rusak`);
          }
          if (!re.test(value)) return invalid(node.id, `${field.label} tidak sesuai format`);
        }
      }
      return null;
    }
    case 'BillInquiry': {
      if (step.type !== 'BillInquiry') break;
      const collected = collectedCustomerId(priorSteps);
      if (!collected || collected !== step.customerId) {
        return invalid(node.id, 'ID pelanggan tidak cocok dengan input sebelumnya');
      }
      if (!Number.isInteger(step.amountDue) || step.amountDue <= 0) {
        return invalid(node.id, 'Tagihan tidak valid');
      }
      return null;
    }
  }
  return { nodeId: node.id, code: 'ILLEGAL_PATH', message: 'Alur transaksi tidak valid' };
}

/** The customer identifier gathered earlier on the path (last CustomerIdInput, else last phone). */
export function collectedCustomerId(steps: FlowStep[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.type === 'CustomerIdInput') return s.values.customerId.trim();
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.type === 'PhoneNumberInput') return normalizeIndonesianMobile(s.phoneNumber);
  }
  return null;
}

export type WalkResult = { ok: true } | { ok: false; error: StepError };

/**
 * Re-walks `steps` from the root: each step must sit on the node the previous
 * step led to, pass input validation, and the last step must reach a leaf.
 * Used by the backend before any money moves.
 */
export function walkPath(tree: SegmentTree, steps: FlowStep[], ctx: WalkContext): WalkResult {
  if (steps.length === 0 || steps.length > MAX_STEPS) {
    return { ok: false, error: { nodeId: tree.rootId, code: 'ILLEGAL_PATH', message: 'Alur transaksi tidak valid' } };
  }
  let cur: NodeId | null = tree.rootId;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!cur) {
      return { ok: false, error: { nodeId: step.nodeId, code: 'ILLEGAL_PATH', message: 'Alur transaksi tidak valid' } };
    }
    const node: TreeNode | undefined = tree.nodes[cur];
    if (!node || step.nodeId !== cur) {
      return { ok: false, error: { nodeId: cur, code: 'ILLEGAL_PATH', message: 'Alur transaksi tidak valid' } };
    }
    const err = validateStepInput(node, step, ctx, steps.slice(0, i));
    if (err) return { ok: false, error: err };
    cur = resolveNext(node, step, ctx);
  }
  if (cur !== null) {
    return { ok: false, error: { nodeId: cur, code: 'INCOMPLETE_PATH', message: 'Transaksi belum lengkap' } };
  }
  return { ok: true };
}

/**
 * Price of a completed flow. `markupTotal` is the referral markup owed to the
 * agent's upline (added once, on top of any priced item). For BillInquiry the
 * server passes its fresh inquiry result; the app passes the echoed step.
 */
export function computeTotal(
  steps: FlowStep[],
  tree: SegmentTree,
  ctx: WalkContext,
  markupTotal: number,
  inquiry?: InquiryResult | null,
): PriceBreakdown {
  for (const step of steps) {
    const node = tree.nodes[step.nodeId];
    if (!node) continue;
    if (step.type === 'PackagesList' && node.type === 'PackagesList') {
      const pkg = ctx.packages[step.packageId];
      if (!pkg) throw new Error('Paket tidak ditemukan');
      const amountBase = pkg.hargaAgen;
      return { amountBase, adminFee: 0, markupTotal, total: amountBase + markupTotal, priceSource: 'package', packageId: pkg.id };
    }
    if (step.type === 'EnterAmount' && node.type === 'EnterAmount') {
      const adminFee = node.adminFee;
      return { amountBase: step.amount, adminFee, markupTotal, total: step.amount + adminFee + markupTotal, priceSource: 'amount' };
    }
    if (step.type === 'BillInquiry' && node.type === 'BillInquiry') {
      const amountBase = inquiry ? inquiry.amountDue : step.amountDue;
      const adminFee = inquiry ? inquiry.adminFee : step.adminFee ?? node.adminFee;
      return { amountBase, adminFee, markupTotal, total: amountBase + adminFee + markupTotal, priceSource: 'inquiry' };
    }
  }
  throw new Error('Alur tidak menghasilkan harga');
}

/** Human-readable rows for the confirmation page and the frozen transaction summary. */
export function describeSteps(
  steps: FlowStep[],
  tree: SegmentTree,
  ctx: WalkContext,
  inquiry?: InquiryResult | null,
): ConfirmationRow[] {
  const rows: ConfirmationRow[] = [];
  for (const step of steps) {
    const node = tree.nodes[step.nodeId];
    if (!node) continue;
    switch (step.type) {
      case 'ListNode': {
        if (node.type !== 'ListNode') break;
        const row = node.rows.find((r) => r.id === step.rowId);
        rows.push({ label: node.title, value: row?.label ?? step.rowId });
        break;
      }
      case 'PhoneNumberInput': {
        if (node.type !== 'PhoneNumberInput') break;
        const normalized = normalizeIndonesianMobile(step.phoneNumber);
        const provider = detectProvider(normalized, ctx.prefixes);
        rows.push({ label: node.label, value: provider ? `${normalized} (${PROVIDER_LABELS[provider]})` : normalized });
        break;
      }
      case 'CustomerIdInput': {
        if (node.type !== 'CustomerIdInput') break;
        for (const field of node.fields) {
          const value = step.values[field.key];
          if (value) rows.push({ label: field.label, value });
        }
        break;
      }
      case 'PackagesList': {
        const pkg = ctx.packages[step.packageId];
        rows.push({ label: 'Paket', value: pkg ? pkg.name : step.packageId });
        break;
      }
      case 'EnterAmount': {
        if (node.type !== 'EnterAmount') break;
        rows.push({ label: node.label, value: formatRp(step.amount) });
        break;
      }
      case 'BillInquiry': {
        const name = inquiry?.customerName ?? step.customerName;
        const periode = inquiry?.periode ?? step.periode;
        if (name) rows.push({ label: 'Nama Pelanggan', value: name });
        if (periode) rows.push({ label: 'Periode', value: periode });
        rows.push({ label: 'Tagihan', value: formatRp(inquiry ? inquiry.amountDue : step.amountDue) });
        break;
      }
    }
  }
  return rows;
}
