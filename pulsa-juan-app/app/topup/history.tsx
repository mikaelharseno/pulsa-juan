import { useRouter } from 'expo-router';
import { formatRp } from 'pulsa-juan-common';
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { useTopUps } from '../../src/api/hooks';
import { Empty, ErrorView, Loading, Screen, StatusPill } from '../../src/components/ui';
import { colors, font, size } from '../../src/theme';
import { fmtDate } from '../(tabs)/transaksi';

export default function TopUpHistoryScreen() {
  const q = useTopUps();
  const router = useRouter();
  return (
    <Screen title="Riwayat Top Up" padded={false}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : q.data!.length === 0 ? (
        <Empty text="Belum ada top up" />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(item.bank ? `/topup/${item.id}/pay` : `/topup/${item.id}/bank`)} style={{ backgroundColor: colors.card, marginHorizontal: size.gutter, marginTop: 10, padding: 14, borderRadius: size.cardRadius, borderWidth: 1, borderColor: colors.divider }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: font.rowLabel, fontWeight: '600', color: colors.text }}>#{item.orderNumber} · {item.bank ?? 'Bank belum dipilih'}</Text>
                <Text style={{ fontSize: font.rowLabel, fontWeight: '700', color: colors.text }}>{formatRp(item.totalTransfer)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: font.rowSub, color: colors.muted }}>{fmtDate(item.createdAt)}{item.isCredit ? ' · kredit' : ''}</Text>
                <StatusPill status={item.status} />
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
