import { formatRp } from 'pulsa-juan-common';
import React from 'react';
import { FlatList, Text, View } from 'react-native';

import { useCommissions } from '../src/api/hooks';
import { Empty, ErrorView, Loading, Screen, StatusPill } from '../src/components/ui';
import { colors, font, size } from '../src/theme';
import { fmtDate } from './(tabs)/transaksi';

export default function KomisiScreen() {
  const q = useCommissions();
  return (
    <Screen title="Riwayat Komisi" padded={false}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : q.data!.entries.length === 0 ? (
        <Empty text="Belum ada komisi" />
      ) : (
        <FlatList
          data={q.data!.entries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.card, marginHorizontal: size.gutter, marginTop: 10, padding: 14, borderRadius: size.cardRadius, borderWidth: 1, borderColor: colors.divider }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: font.rowLabel, fontWeight: '600', color: colors.text }}>
                  {item.sourceAgentName} · {item.level === 1 ? 'mitra' : 'mitra tingkat 2'}
                </Text>
                <Text style={{ fontSize: font.rowLabel, fontWeight: '700', color: colors.primary }}>+{formatRp(item.amount)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: font.rowSub, color: colors.muted }}>
                  #{item.transaction.trxNumber} {item.transaction.segmentLabel} · {fmtDate(item.createdAt)}
                </Text>
                <StatusPill status={item.status === 'UNCLAIMED' ? (item.transaction.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING') : item.status === 'CLAIMED' ? 'PAID' : 'FAILED'} />
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
