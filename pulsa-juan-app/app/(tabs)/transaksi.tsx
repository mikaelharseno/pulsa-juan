import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { formatRp } from 'pulsa-juan-common';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { useTransactions } from '../../src/api/hooks';
import { Transaction } from '../../src/api/types';
import { Button, DarkTabs, Empty, ErrorView, Field, Loading, Screen, SectionBand, StatusPill } from '../../src/components/ui';
import { ServiceTile } from '../../src/icons/ServiceIcon';
import { colors, font, size } from '../../src/theme';

export function fmtDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const key = (x: Date) => x.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key(d) === key(today)) return 'Hari ini';
  if (key(d) === key(yesterday)) return 'Kemarin';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface Filters {
  from?: string;
  to?: string;
  phone?: string;
  minAmount?: string;
  maxAmount?: string;
  sort: 'createdAt' | 'total';
  dir: 'asc' | 'desc';
}

export default function TransaksiScreen() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({ sort: 'createdAt', dir: 'desc' });
  const [draft, setDraft] = useState<Filters>(filters);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Transaction[]>([]);
  const q = useTransactions({ ...filters, page, pageSize: 25 });

  React.useEffect(() => {
    if (!q.data) return;
    setRows((prev) => (page === 1 ? q.data.transactions : [...prev, ...q.data.transactions]));
  }, [q.data, page]);

  const apply = (f: Filters) => {
    setFilters(f);
    setPage(1);
    setOpen(false);
  };
  const activeCount = [filters.from, filters.to, filters.phone, filters.minAmount, filters.maxAmount].filter(Boolean).length;
  const tab = filters.sort === 'createdAt' ? 'terbaru' : 'nominal';

  const sections = useMemo(() => {
    if (filters.sort === 'total') return [{ title: filters.dir === 'desc' ? 'Nominal terbesar' : 'Nominal terkecil', data: rows }];
    const map = new Map<string, Transaction[]>();
    for (const r of rows) {
      const k = dayLabel(r.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map, ([title, data]) => ({ title, data }));
  }, [rows, filters.sort, filters.dir]);

  return (
    <Screen
      title="Transaksi"
      back={false}
      padded={false}
      right={
        <Pressable onPress={() => { setDraft(filters); setOpen(true); }} hitSlop={10} accessibilityLabel="Filter">
          <Ionicons name="options-outline" size={22} color={colors.ink} />
          {activeCount ? <View style={{ position: 'absolute', top: -2, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
        </Pressable>
      }
    >
      <DarkTabs
        tabs={[
          { key: 'terbaru', label: filters.sort === 'createdAt' && filters.dir === 'asc' ? 'Terlama' : 'Terbaru', icon: 'time-outline' },
          { key: 'nominal', label: filters.sort === 'total' && filters.dir === 'asc' ? 'Nominal ↑' : 'Nominal ↓', icon: 'swap-vertical-outline' },
        ]}
        value={tab}
        onChange={(k) => {
          if (k === 'terbaru') apply({ ...filters, sort: 'createdAt', dir: filters.sort === 'createdAt' && filters.dir === 'desc' ? 'asc' : 'desc' });
          else apply({ ...filters, sort: 'total', dir: filters.sort === 'total' && filters.dir === 'desc' ? 'asc' : 'desc' });
        }}
      />
      {q.isLoading && page === 1 ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Empty text="Belum ada transaksi" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => q.data && rows.length < q.data.total && !q.isFetching && setPage((p) => p + 1)}
          refreshing={q.isRefetching}
          onRefresh={() => { setPage(1); q.refetch(); }}
          renderSectionHeader={({ section }) => <SectionBand>{section.title}</SectionBand>}
          renderItem={({ item, index, section }) => (
            <Pressable
              onPress={() => router.push(`/transaction/${item.id}/result?from=list`)}
              style={({ pressed }) => [styles.row, index < section.data.length - 1 && styles.rowBorder, pressed && { backgroundColor: colors.tealTint }]}
            >
              <View style={{ marginRight: 12 }}>
                <ServiceTile iconUrl={item.segment?.iconUrl} slug={item.segment?.slug} px={38} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label} numberOfLines={1}>{item.segmentLabel}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.phoneNumber ?? item.customerId ?? '-'} · {fmtTime(item.createdAt)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{formatRp(item.total)}</Text>
                <View style={{ marginTop: 4 }}><StatusPill status={item.status} /></View>
              </View>
            </Pressable>
          )}
        />
      )}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' }} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Filter transaksi</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Dari (YYYY-MM-DD)" value={draft.from ?? ''} onChangeText={(v) => setDraft({ ...draft, from: v })} placeholder="2026-01-01" style={{ flex: 1 }} />
            <Field label="Sampai" value={draft.to ?? ''} onChangeText={(v) => setDraft({ ...draft, to: v })} placeholder="2026-01-31" style={{ flex: 1 }} />
          </View>
          <Field label="Nomor HP" value={draft.phone ?? ''} onChangeText={(v) => setDraft({ ...draft, phone: v })} keyboardType="phone-pad" placeholder="08xx" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Nominal min" value={draft.minAmount ?? ''} onChangeText={(v) => setDraft({ ...draft, minAmount: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="0" style={{ flex: 1 }} />
            <Field label="Nominal maks" value={draft.maxAmount ?? ''} onChangeText={(v) => setDraft({ ...draft, maxAmount: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="1000000" style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Reset" variant="outline" style={{ flex: 1 }} onPress={() => apply({ sort: 'createdAt', dir: 'desc' })} />
            <Button title="Terapkan" variant="ink" style={{ flex: 1 }} onPress={() => apply(draft)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: size.gutter, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  label: { fontSize: font.rowLabel, fontWeight: '600', color: colors.ink, letterSpacing: -0.1 },
  sub: { fontSize: font.small, color: colors.muted, marginTop: 2 },
  amount: { fontSize: font.rowLabel, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  sheetTitle: { fontSize: font.title, fontWeight: '600', color: colors.ink, marginBottom: 12 },
});
