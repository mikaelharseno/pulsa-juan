import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';

import { useKyc } from '../../src/api/hooks';
import { Button, Card, ErrorView, Loading, Screen, SectionTitle } from '../../src/components/ui';
import { useKycDraft } from '../../src/kyc/useKycDraft';
import { colors, font } from '../../src/theme';

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: 'card-outline', title: 'Foto KTP', sub: 'NIK dan nama dibaca otomatis dari foto, lalu Anda periksa.' },
  { icon: 'color-palette-outline', title: 'Cek wajah langsung', sub: 'Layar berkedip merah, biru, kuning. Tatap layar dari dekat.' },
  { icon: 'happy-outline', title: 'Selfie', sub: 'Foto wajah untuk dicocokkan dengan KTP oleh admin.' },
];

/** "Plus" intro and status. Plus services (e-wallet top-ups) need a verified identity. */
export default function VerifikasiScreen() {
  const router = useRouter();
  const kyc = useKyc();
  const reset = useKycDraft((s) => s.reset);

  if (kyc.isLoading) return <Screen title="Verifikasi Identitas"><Loading /></Screen>;
  if (kyc.isError) return <Screen title="Verifikasi Identitas"><ErrorView message={(kyc.error as Error).message} onRetry={() => kyc.refetch()} /></Screen>;
  const st = kyc.data!;
  const canStart = st.status === 'NONE' || st.status === 'REJECTED';

  const banner =
    st.status === 'VERIFIED'
      ? { icon: 'shield-checkmark' as const, color: colors.tealDark, bg: colors.tealSoft, title: 'Identitas terverifikasi', sub: 'Semua layanan Plus sudah bisa Anda pakai.' }
      : st.status === 'PENDING'
        ? { icon: 'time' as const, color: colors.warning, bg: '#FEF3C7', title: 'Sedang diperiksa admin', sub: 'Biasanya selesai di jam kerja. Anda akan bisa memakai layanan Plus setelah disetujui.' }
        : st.status === 'REJECTED'
          ? { icon: 'close-circle' as const, color: colors.danger, bg: '#FEE2E2', title: 'Verifikasi ditolak', sub: st.rejectReason ? `Alasan: ${st.rejectReason}. Silakan ulangi.` : 'Silakan ulangi verifikasi.' }
          : null;

  return (
    <Screen title="Verifikasi Identitas">
      <ScrollView>
        {banner ? (
          <View style={{ flexDirection: 'row', backgroundColor: banner.bg, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <Ionicons name={banner.icon} size={26} color={banner.color} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: '700', color: colors.ink, fontSize: font.body }}>{banner.title}</Text>
              <Text style={{ color: colors.ink2, fontSize: font.small, marginTop: 2 }}>{banner.sub}</Text>
            </View>
          </View>
        ) : null}
        <Card style={{ marginBottom: 12 }}>
          <SectionTitle>Layanan Plus</SectionTitle>
          <Text style={{ color: colors.ink2, fontSize: font.body }}>
            Top up e-wallet (GoPay, OVO, DANA dan lainnya) bisa dipakai seperti uang tunai, jadi kami wajib memastikan identitas pemilik akun. Data KTP dan foto Anda hanya dilihat admin untuk verifikasi.
          </Text>
        </Card>
        {canStart ? (
          <Card style={{ marginBottom: 12 }}>
            <SectionTitle>Langkahnya</SectionTitle>
            {STEPS.map((s, i) => (
              <View key={s.title} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: i ? 12 : 4 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name={s.icon} size={18} color={colors.tealDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.ink, fontSize: font.body }}>{i + 1}. {s.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 1 }}>{s.sub}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}
        {canStart ? (
          Platform.OS === 'web' ? (
            <Text style={{ color: colors.warning, fontSize: font.body, textAlign: 'center' }}>Verifikasi identitas memakai kamera HP. Buka aplikasi Murah Kuota di Android untuk melanjutkan.</Text>
          ) : (
            <Button title={st.status === 'REJECTED' ? 'Ulangi verifikasi' : 'Mulai verifikasi'} onPress={() => { reset(); router.push('/verifikasi/ktp'); }} />
          )
        ) : (
          <Button title="Kembali" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}
