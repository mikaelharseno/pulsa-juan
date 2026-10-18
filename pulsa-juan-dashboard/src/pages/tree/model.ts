import { NodeId, NodeType, outgoingIds, PROVIDERS, reachableIds, SegmentTree, TreeNode } from 'pulsa-juan-common';

export function randomNodeId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = 'n_';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function defaultNode(type: NodeType, id: NodeId, title = ''): TreeNode {
  switch (type) {
    case 'ListNode':
      return { id, type, title: title || 'Pilih Layanan', rows: [{ id: 'r1', label: 'Pilihan 1', childId: '', isActive: true }] };
    case 'PackagesList':
      return { id, type, title: title || 'Pilih Paket', source: { kind: 'CATEGORY', category: '' }, nextId: null };
    case 'PhoneNumberInput':
      return { id, type, title: title || 'Nomor HP', label: 'Nomor HP', allowedProviders: null, branches: {}, defaultChildId: null };
    case 'EnterAmount':
      return { id, type, title: title || 'Nominal', label: 'Nominal', min: 10000, max: 1000000, step: 1000, quickAmounts: [20000, 50000, 100000], adminFee: 0, nextId: null };
    case 'CustomerIdInput':
      return { id, type, title: title || 'ID Pelanggan', fields: [{ key: 'customerId', label: 'ID Pelanggan', keyboard: 'numeric', required: true }], nextId: null };
    case 'BillInquiry':
      return { id, type, title: title || 'Cek Tagihan', product: '', adminFee: 0, nextId: null };
  }
}

export function emptyTree(rootType: NodeType): SegmentTree {
  const id = randomNodeId();
  return { schemaVersion: 1, rootId: id, nodes: { [id]: defaultNode(rootType, id) } };
}

/** Edge label + child for the outline (what the user tapped to get there). */
export function edges(node: TreeNode): { label: string; childId: NodeId }[] {
  switch (node.type) {
    case 'ListNode':
      return node.rows.filter((r) => r.childId).map((r) => ({ label: r.label, childId: r.childId }));
    case 'PhoneNumberInput': {
      const out: { label: string; childId: NodeId }[] = PROVIDERS.filter((p) => node.branches[p]).map((p) => ({ label: p, childId: node.branches[p]! }));
      if (node.defaultChildId) out.push({ label: 'default', childId: node.defaultChildId });
      return out;
    }
    default:
      return node.nextId ? [{ label: 'lanjut', childId: node.nextId }] : [];
  }
}

/** Replaces every reference to `from` with `to` (or removes it when `to` is null). */
export function relink(node: TreeNode, from: NodeId, to: NodeId | null): TreeNode {
  const copy = JSON.parse(JSON.stringify(node)) as TreeNode;
  switch (copy.type) {
    case 'ListNode':
      copy.rows = copy.rows.map((r) => (r.childId === from ? { ...r, childId: to ?? '' } : r));
      break;
    case 'PhoneNumberInput':
      for (const p of PROVIDERS) if (copy.branches[p] === from) { if (to) copy.branches[p] = to; else delete copy.branches[p]; }
      if (copy.defaultChildId === from) copy.defaultChildId = to;
      break;
    default:
      if (copy.nextId === from) copy.nextId = to;
  }
  return copy;
}

/** Nodes that become unreachable if `id` is removed (id itself included). */
export function exclusiveSubtree(tree: SegmentTree, id: NodeId): NodeId[] {
  if (id === tree.rootId) return Object.keys(tree.nodes);
  const without: SegmentTree = { ...tree, nodes: { ...tree.nodes } };
  delete without.nodes[id];
  for (const k of Object.keys(without.nodes)) without.nodes[k] = relink(without.nodes[k], id, null);
  const stillReachable = reachableIds(without);
  const before = reachableIds(tree);
  return Array.from(before).filter((n) => !stillReachable.has(n));
}

export function changeType(node: TreeNode, type: NodeType): TreeNode {
  const fresh = defaultNode(type, node.id, node.title);
  if (node.subtitle) fresh.subtitle = node.subtitle;
  return fresh;
}

export { outgoingIds };
