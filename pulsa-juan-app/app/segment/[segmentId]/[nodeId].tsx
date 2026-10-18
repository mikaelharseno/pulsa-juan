import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FlowStep, resolveNext } from 'pulsa-juan-common';
import React, { useCallback, useEffect } from 'react';

import { useAgentConfig, useTree } from '../../../src/api/hooks';
import { ErrorView, Loading, Screen } from '../../../src/components/ui';
import { useFlowSession, useFlowStore } from '../../../src/flow/useFlowStore';
import { NODE_RENDERERS, UnsupportedNodeScreen } from '../../../src/nodes';

export default function NodeScreen() {
  const { segmentId, nodeId } = useLocalSearchParams<{ segmentId: string; nodeId: string }>();
  const router = useRouter();
  const tree = useTree(segmentId);
  const config = useAgentConfig();
  const session = useFlowSession(segmentId);
  const commit = useFlowStore((s) => s.commit);
  const truncateAt = useFlowStore((s) => s.truncateAt);
  const start = useFlowStore((s) => s.start);

  // Returning to a node (back gesture) discards every choice made after it.
  useFocusEffect(
    useCallback(() => {
      truncateAt(segmentId, nodeId);
    }, [segmentId, nodeId, truncateAt]),
  );
  // Deep link straight into a node: start the session once the tree is known.
  const treeVersion = tree.data?.treeVersion;
  useEffect(() => {
    if (!session && treeVersion !== undefined) start(segmentId, treeVersion);
  }, [session, treeVersion, segmentId, start]);

  if (tree.isLoading) return <Screen title="Memuat..."><Loading /></Screen>;
  if (tree.isError) return <Screen title="Layanan"><ErrorView message={(tree.error as Error).message} onRetry={() => tree.refetch()} /></Screen>;
  const data = tree.data!;
  const node = data.tree.nodes[nodeId];
  if (!node) return <Screen title={data.segment.label}><ErrorView message="Halaman tidak ditemukan" /></Screen>;
  if (!session) return <Screen title={data.segment.label}><Loading /></Screen>;
  const Renderer = NODE_RENDERERS[node.type] ?? UnsupportedNodeScreen;
  const prefixes = config.data?.prefixes ?? [];

  const onComplete = (step: FlowStep) => {
    commit(segmentId, step);
    const next = resolveNext(node, step, { prefixes, packages: data.packages });
    router.push(next ? `/segment/${segmentId}/${next}` : `/segment/${segmentId}/confirm`);
  };

  return (
    <Screen title={node.title || data.segment.label} padded={false}>
      <Renderer
        node={node}
        tree={data.tree}
        packages={data.packages}
        prefixes={prefixes}
        markupTotal={data.markupTotal}
        segmentId={segmentId}
        segmentIcon={{ iconUrl: data.segment.iconUrl, slug: data.segment.slug }}
        session={session}
        onComplete={onComplete}
      />
    </Screen>
  );
}
