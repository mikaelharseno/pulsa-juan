import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';

import { useTree } from '../../../src/api/hooks';
import { ErrorView, Loading, Screen } from '../../../src/components/ui';
import { useFlowStore } from '../../../src/flow/useFlowStore';

/** Entry: load the tree, (re)start the flow session, jump to the root node. */
export default function SegmentEntry() {
  const { segmentId } = useLocalSearchParams<{ segmentId: string }>();
  const tree = useTree(segmentId);
  const start = useFlowStore((s) => s.start);
  const clear = useFlowStore((s) => s.clear);

  useEffect(() => {
    if (tree.data) {
      clear(segmentId);
      start(segmentId, tree.data.treeVersion);
    }
  }, [tree.data, segmentId, start, clear]);

  if (tree.isLoading) return <Screen title="Memuat..."><Loading /></Screen>;
  if (tree.isError) return <Screen title="Layanan"><ErrorView message={(tree.error as Error).message} onRetry={() => tree.refetch()} /></Screen>;
  if (tree.data!.segment.maintenanceMessage) return <Screen title={tree.data!.segment.label}><ErrorView message={tree.data!.segment.maintenanceMessage} /></Screen>;
  return <Redirect href={`/segment/${segmentId}/${tree.data!.tree.rootId}`} />;
}
