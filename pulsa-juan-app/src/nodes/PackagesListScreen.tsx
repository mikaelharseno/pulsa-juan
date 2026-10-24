import { formatRp, PackagesList, resolvePackageIds } from 'pulsa-juan-common';
import React from 'react';
import { FlatList, Text, View } from 'react-native';

import { Empty, ListCard, ListRow } from '../components/ui';
import { ServiceTile } from '../icons/ServiceIcon';
import { colors, font } from '../theme';
import { NodeRendererProps } from './types';

export default function PackagesListScreen({ node, packages, markupTotal, segmentIcon, onComplete }: NodeRendererProps) {
  const n = node as PackagesList;
  const ids = resolvePackageIds(n, packages);
  if (ids.length === 0) return <Empty text="Belum ada paket tersedia" />;
  return (
    <View style={{ flex: 1 }}>
      {n.subtitle ? <Text style={{ color: colors.muted, fontSize: font.body, padding: 16, paddingBottom: 8 }}>{n.subtitle}</Text> : null}
      <ListCard style={{ flex: 1 }}>
        <FlatList
          data={ids}
          keyExtractor={(id) => id}
          renderItem={({ item, index }) => {
            const p = packages[item];
            return (
              <ListRow
                label={p.name}
                detail={p.description}
                sublabel={formatRp(p.hargaAgen + markupTotal)}
                sublabelColor={colors.tealDark}
                imageUrl={p.imageUrl}
                leading={!p.imageUrl && segmentIcon ? <View style={{ marginRight: 12 }}><ServiceTile iconUrl={segmentIcon.iconUrl} slug={segmentIcon.slug} px={40} /></View> : undefined}
                last={index === ids.length - 1}
                onPress={() => onComplete({ nodeId: n.id, type: 'PackagesList', packageId: p.id })}
              />
            );
          }}
        />
      </ListCard>
    </View>
  );
}
