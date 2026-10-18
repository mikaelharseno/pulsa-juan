import { ListNode } from 'pulsa-juan-common';
import React from 'react';
import { FlatList, Text, View } from 'react-native';

import { ListCard, ListRow } from '../components/ui';
import { ServiceTile } from '../icons/ServiceIcon';
import { colors, font } from '../theme';
import { NodeRendererProps } from './types';

export default function ListNodeScreen({ node, segmentIcon, onComplete }: NodeRendererProps) {
  const n = node as ListNode;
  const rows = n.rows.filter((r) => r.isActive);
  return (
    <View style={{ flex: 1 }}>
      {n.subtitle ? <Text style={{ color: colors.muted, fontSize: font.body, padding: 16, paddingBottom: 8 }}>{n.subtitle}</Text> : null}
      <ListCard style={{ flex: 1 }}>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item, index }) => (
            <ListRow label={item.label} sublabel={item.sublabel} imageUrl={item.imageUrl} leading={!item.imageUrl && segmentIcon ? <View style={{ marginRight: 12 }}><ServiceTile iconUrl={segmentIcon.iconUrl} slug={segmentIcon.slug} px={40} /></View> : undefined} last={index === rows.length - 1} onPress={() => onComplete({ nodeId: n.id, type: 'ListNode', rowId: item.id })} />
          )}
        />
      </ListCard>
    </View>
  );
}
