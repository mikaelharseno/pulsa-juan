import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';

import { useMe, useTree } from '../../../src/api/hooks';
import { ErrorView, Loading, Screen } from '../../../src/components/ui';
import { isCompactTree } from '../../../src/flow/compact';
import { useFlowStore } from '../../../src/flow/useFlowStore';

/** Entry: load the tree, (re)start the flow session, jump to the root node. */
export default function SegmentEntry() {
  const { segmentId, phone } = useLocalSearchParams<{ segmentId: string; phone?: string }>();
  const tree = useTree(segmentId);
  const me = useMe();
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
  // "Plus" service opened by a link or an old screen: identity check first
  if (tree.data!.segment.requiresVerification && me.data && me.data.kycStatus !== 'VERIFIED') return <Redirect href="/verifikasi" />;
  // phone → package type → package: one screen (number on top, types as chips)
  if (isCompactTree(tree.data!.tree)) return <Redirect href={`/segment/${segmentId}/quick${phone ? `?phone=${encodeURIComponent(phone)}` : ''}` as never} />;
  return <Redirect href={`/segment/${segmentId}/${tree.data!.tree.rootId}`} />;
}
