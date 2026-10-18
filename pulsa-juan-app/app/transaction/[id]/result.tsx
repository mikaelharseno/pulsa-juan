import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatRp, toInternationalMobile } from 'pulsa-juan-common';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { useAgentConfig, useTransaction } from '../../../src/api/hooks';
import { openExternal } from '../../../src/components/home';
import { Button, Card, ErrorView, KeyValue, Loading, Screen } from '../../../src/components/ui';
import { colors, font } from '../../../src/theme';
import { fmtDate } from '../../(tabs)/transaksi';

export default function ResultScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const trx = useTransaction(id, true);
  const config = useAgentConfig();

  if (trx.isLoading) return <Screen title="Status Transaksi"><Loading /></Screen>;
  if (trx.isError) return <Screen title="Status Transaksi"><ErrorView message={(trx.error as Error).message} onRetry={() => trx.refetch()} /></Screen>;
  const t = trx.data!;
  const wa = toInternationalMobile(config.data?.cs.whatsapp ?? '');
  const csText = `Halo CS, saya butuh bantuan untuk transaksi #${t.trxNumber} (${t.segmentLabel}, ${formatRp(t.total)}).`;

  const head =
    t.status === 'SUCCESS'
      ? { icon: 'checkmark-circle' as const, color: colors.primary, title: 'Transaksi Sukses', sub: 'Saldo sudah terpotong dan pesanan berhasil diproses.' }
      : t.status === 'FAILED'
        ? { icon: 'close-circle' as const, color: colors.danger, title: 'Transaksi Gagal', sub: t.failReason ? `Alasan: ${t.failReason}. Saldo telah dikembalikan.` : 'Saldo telah dikembalikan ke akun Anda.' }
        : { icon: 'time' as const, color: colors.warning, title: 'Sedang Diproses', sub: 'Pesanan sedang kami proses. Halaman ini akan diperbarui otomatis.' };

  return (
    <Screen title="Status Transaksi" back={from === 'list'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <View style={{ width: 88, height: 88, borderRadius: 28, backgroundColor: t.status === 'SUCCESS' ? colors.tealSoft : t.status === 'FAILED' ? '#FEE2E2' : '#FFF4DE', alignItems: 'center', justifyContent: 'center' }}>
            {t.status === 'PENDING' ? <ActivityIndicator size="large" color={colors.warning} /> : <Ionicons name={head.icon} size={56} color={head.color} />}
          </View>
          <Text style={{ fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 14, letterSpacing: -0.4 }}>{head.title}</Text>
          <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 6, fontSize: font.body }}>{head.sub}</Text>
        </View>
        <Card style={{ marginBottom: 12 }}>
          <KeyValue label="No. transaksi" value={'#' + t.trxNumber} />
          <KeyValue label="Layanan" value={t.segmentLabel} />
          {t.summary.map((r, i) => (
            <KeyValue key={i} label={r.label} value={r.value} />
          ))}
          <KeyValue label="Total" value={formatRp(t.total)} bold />
          {t.serialNumber ? <KeyValue label="SN / Token" value={t.serialNumber} bold /> : null}
          <KeyValue label="Waktu" value={fmtDate(t.createdAt)} />
        </Card>
        <View style={{ flex: 1 }} />
        {t.status === 'FAILED' || t.status === 'PENDING' ? (
          <Button title="Hubungi Customer Service" variant="outline" style={{ marginBottom: 10 }} disabled={!wa} onPress={() => openExternal(`https://wa.me/${wa}?text=${encodeURIComponent(csText)}`)} />
        ) : null}
        <Button title="Kembali ke Beranda" onPress={() => router.replace('/(tabs)')} />
        <View style={{ height: 16 }} />
      </ScrollView>
    </Screen>
  );
}
