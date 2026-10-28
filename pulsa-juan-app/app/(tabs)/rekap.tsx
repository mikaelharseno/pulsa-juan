import { useRouter } from 'expo-router';
import { formatRp } from 'pulsa-juan-common';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useRekap, useSellMargins } from '../../src/api/hooks';
import { Button, Card, Chip, ErrorView, Field, KeyValue, Loading, Screen, SectionTitle } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

function iso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

const PRESETS = [
  { key: 'today', label: 'Hari ini', from: () => iso(new Date()), to: () => iso(new Date()) },
  { key: '7', label: '7 hari', from: () => daysAgo(6), to: () => iso(new Date()) },
  { key: '30', label: '30 hari', from: () => daysAgo(29), to: () => iso(new Date()) },
  { key: 'custom', label: 'Pilih tanggal', from: () => '', to: () => '' },
];

export default function RekapScreen() {
  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState({ from: daysAgo(6), to: iso(new Date()) });
  const [applied, setApplied] = useState(custom);
  const range = useMemo(() => {
    const p = PRESETS.find((x) => x.key === preset)!;
    return preset === 'custom' ? applied : { from: p.from(), to: p.to() };
  }, [preset, applied]);
  const q = useRekap(range.from, range.to);
  const margins = useSellMargins();
  const router = useRouter();
  const noMargins = !!margins.data && margins.data.default === 0 && Object.values(margins.data.bySegment).every((v) => v === 0);

  return (
    <Screen title="Rekap" back={false}>
      <ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <Chip key={p.key} label={p.label} selected={preset === p.key} onPress={() => setPreset(p.key)} />
          ))}
        </View>
        {preset === 'custom' ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="Dari" value={custom.from} onChangeText={(v) => setCustom({ ...custom, from: v })} placeholder="YYYY-MM-DD" /></View>
            <View style={{ flex: 1 }}><Field label="Sampai" value={custom.to} onChangeText={(v) => setCustom({ ...custom, to: v })} placeholder="YYYY-MM-DD" /></View>
            <Button title="OK" style={{ marginBottom: 14, paddingHorizontal: 18 }} onPress={() => setApplied(custom)} />
          </View>
        ) : null}
        <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 8 }}>
          {range.from} s/d {range.to}
        </Text>
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorView message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : (
          <>
            <Card style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.muted, fontSize: font.body }}>Total pengeluaran saldo</Text>
              <Text style={{ color: colors.ink, fontSize: 26, fontWeight: '700', marginVertical: 4, letterSpacing: -0.7 }}>{formatRp(q.data!.totalSpent)}</Text>
              <Text style={{ color: colors.muted, fontSize: font.small }}>{q.data!.count} transaksi (diproses + sukses)</Text>
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <SectionTitle>Pendapatan</SectionTitle>
              <KeyValue label={`Omzet (${q.data!.income.count} transaksi sukses)`} value={formatRp(q.data!.income.omzet)} />
              <KeyValue label="Modal" value={formatRp(q.data!.income.modal)} />
              <KeyValue label="Untung jualan" value={formatRp(q.data!.income.profit)} />
              <KeyValue label={`Komisi mitra (${q.data!.income.commissionCount})`} value={formatRp(q.data!.income.commission)} />
              <KeyValue label="Total pendapatan" value={formatRp(q.data!.income.total)} bold last />
              {noMargins ? (
                <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 8 }}>
                  Untung jualan dihitung dari harga jual Anda.{' '}
                  <Text style={{ color: colors.teal, fontWeight: '700' }} onPress={() => router.push('/harga-jual')}>Atur harga jual</Text>
                </Text>
              ) : null}
            </Card>
            {q.data!.bySegment.length ? (
              <Card style={{ marginBottom: 12 }}>
                <SectionTitle>Per layanan</SectionTitle>
                {q.data!.bySegment.map((s) => (
                  <KeyValue key={s.segmentLabel} label={`${s.segmentLabel} (${s.count})`} value={formatRp(s.totalSpent)} />
                ))}
              </Card>
            ) : null}
            {q.data!.byDay.length ? (
              <Card>
                <SectionTitle>Per hari</SectionTitle>
                {q.data!.byDay.map((d) => (
                  <KeyValue key={d.date} label={`${d.date} (${d.count})`} value={formatRp(d.totalSpent)} />
                ))}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
