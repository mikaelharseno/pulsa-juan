import { Ionicons } from '@expo/vector-icons';
import { formatRp } from 'pulsa-juan-common';
import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';

import { useLedger, useMe } from '../src/api/hooks';
import { LedgerEntry } from '../src/api/types';
import { Empty, ErrorView, Loading, Screen } from '../src/components/ui';
import { colors, font, size } from '../src/theme';
import { fmtDate } from './(tabs)/transaksi';

const TYPE: Record<LedgerEntry['type'], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  TOPUP: { label: 'Top up saldo', icon: 'add-circle-outline' },
  PURCHASE: { label: 'Transaksi', icon: 'cart-outline' },
  REFUND: { label: 'Refund', icon: 'return-down-back-outline' },
  ADJUSTMENT: { label: 'Penyesuaian', icon: 'construct-outline' },
  COMMISSION: { label: 'Klaim komisi', icon: 'gift-outline' },
};

/** Riwayat Saldo: every saldo mutation with the balance after it, newest first. */
export default function SaldoHistoryScreen() {
  const me = useMe();
  const q = useLedger();
  const rows = q.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <Screen title="Riwayat Saldo" padded={false}>
      <View style={{ backgroundColor: colors.card, padding: size.gutter, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <Text style={{ color: colors.muted, fontSize: font.small }}>Saldo saat ini</Text>
        <Text style={{ color: colors.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 }}>{formatRp(me.data?.saldo ?? 0)}</Text>
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Empty text="Belum ada mutasi saldo" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(e) => e.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => { q.refetch(); me.refetch(); }} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} color={colors.teal} /> : <View style={{ height: 24 }} />}
          renderItem={({ item }) => {
            const t = TYPE[item.type] ?? { label: item.type, icon: 'ellipse-outline' as const };
            const plus = item.delta > 0;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: size.gutter, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: plus ? colors.tealSoft : '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name={t.icon} size={18} color={plus ? colors.tealDark : colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.rowLabel, fontWeight: '600', color: colors.ink }}>{t.label}</Text>
                  <Text style={{ fontSize: font.rowSub, color: colors.muted, marginTop: 1 }} numberOfLines={1}>{item.note ?? '-'}</Text>
                  <Text style={{ fontSize: font.tiny, color: colors.subtle, marginTop: 1 }}>{fmtDate(item.createdAt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: font.rowLabel, fontWeight: '700', color: plus ? colors.tealDark : colors.danger }}>{plus ? '+' : '−'}{formatRp(Math.abs(item.delta))}</Text>
                  <Text style={{ fontSize: font.tiny, color: colors.muted, marginTop: 2 }}>Saldo {formatRp(item.balanceAfter)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}
