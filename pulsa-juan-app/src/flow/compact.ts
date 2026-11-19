import { ListNode, NodeId, outgoingIds, PackagesList, SegmentTree, TreeNode } from 'pulsa-juan-common';

// "Compact" flow (meeting 14 Nov 2026): a tile whose tree is
//   PhoneNumberInput → (ListNode of package types →) PackagesList
// is shown on ONE screen: phone number on top, the package types as chips,
// the packages of the chosen type below. Anything deeper keeps the step-by-step flow.

/** Package types under `nodeId`: the ListNode's active rows that open a PackagesList, or the list itself. */
export function compactChoices(tree: SegmentTree, nodeId: NodeId | null | undefined) {
  const node: TreeNode | undefined = nodeId ? tree.nodes[nodeId] : undefined;
  if (!node) return null;
  if (node.type === 'PackagesList') return { listNode: null as ListNode | null, rows: [{ id: '', label: node.title, list: node }] };
  if (node.type !== 'ListNode') return null;
  const rows = node.rows.filter((r) => r.isActive);
  if (!rows.length) return null;
  const out: { id: string; label: string; list: PackagesList }[] = [];
  for (const r of rows) {
    const child = tree.nodes[r.childId];
    if (!child || child.type !== 'PackagesList') return null;
    out.push({ id: r.id, label: r.label, list: child });
  }
  return { listNode: node as ListNode | null, rows: out };
}

/** Whether the whole tile fits the compact screen. */
export function isCompactTree(tree: SegmentTree) {
  const root = tree.nodes[tree.rootId];
  if (!root || root.type !== 'PhoneNumberInput') return false;
  const next = outgoingIds(root);
  return next.length > 0 && next.every((id) => !!compactChoices(tree, id));
}
