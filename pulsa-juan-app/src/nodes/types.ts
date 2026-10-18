import { FlowSession, FlowStep, PackagePublic, PrefixEntry, SegmentTree, TreeNode } from 'pulsa-juan-common';

export interface NodeRendererProps {
  node: TreeNode;
  tree: SegmentTree;
  packages: Record<string, PackagePublic>;
  prefixes: PrefixEntry[];
  markupTotal: number;
  segmentId: string;
  /** For leading tiles on rows that have no image of their own. */
  segmentIcon?: { iconUrl: string | null; slug: string };
  session: FlowSession;
  /** Commit the step and move on (the caller decides where). */
  onComplete: (step: FlowStep) => void;
}
