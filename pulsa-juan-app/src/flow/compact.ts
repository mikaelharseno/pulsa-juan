import { FlowStep, NodeId, outgoingIds, PackagesList, SegmentTree, TreeNode } from 'pulsa-juan-common';

// "Compact" flow (meeting 14 Nov 2026): a tile whose tree is
//   PhoneNumberInput → (ListNode of package types [→ "more" ListNode …] →) PackagesList
// is shown on ONE screen: phone number on top, every package type as a chip,
// the packages of the chosen type below. Anything else keeps the step-by-step flow.

export interface CompactChoice {
  id: string;
  label: string;
  list: PackagesList;
  /** ListNode steps from the phone's next node down to `list` */
  path: FlowStep[];
}

/** Package types under `nodeId`, flattening nested ListNodes ("Kategori lainnya…"); null if the shape doesn't fit. */
export function compactChoices(tree: SegmentTree, nodeId: NodeId | null | undefined, depth = 0): { title: string; rows: CompactChoice[] } | null {
  const node: TreeNode | undefined = nodeId ? tree.nodes[nodeId] : undefined;
  if (!node || depth > 3) return null;
  if (node.type === 'PackagesList') return { title: node.title, rows: [{ id: node.id, label: node.title, list: node, path: [] }] };
  if (node.type !== 'ListNode') return null;
  const out: CompactChoice[] = [];
  for (const r of node.rows.filter((x) => x.isActive)) {
    const step: FlowStep = { nodeId: node.id, type: 'ListNode', rowId: r.id };
    const child = tree.nodes[r.childId];
    if (child?.type === 'PackagesList') {
      out.push({ id: `${node.id}:${r.id}`, label: r.label, list: child, path: [step] });
      continue;
    }
    const nested = compactChoices(tree, r.childId, depth + 1);
    if (!nested) return null;
    for (const c of nested.rows) out.push({ ...c, path: [step, ...c.path] });
  }
  return out.length ? { title: node.title, rows: out } : null;
}

/** Whether the whole tile fits the compact screen. */
export function isCompactTree(tree: SegmentTree) {
  const root = tree.nodes[tree.rootId];
  if (!root || root.type !== 'PhoneNumberInput') return false;
  const next = outgoingIds(root);
  return next.length > 0 && next.every((id) => !!compactChoices(tree, id));
}
