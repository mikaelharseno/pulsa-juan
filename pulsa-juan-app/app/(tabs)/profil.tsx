import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { formatRp } from 'pulsa-juan-common';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useClaimCommissions, useCommissions, useMe } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/useAuth';
import { Button, Card, ErrorView, KeyValue, Loading, Screen, SectionBand } from '../../src/components/ui';
import { colors, font, size } from '../../src/theme';

// shown so agents can tell CS which build they run (matches releases.json on the landing page)
const APP_VERSION = `${Constants.expoConfig?.version ?? '-'} (${Constants.expoConfig?.android?.versionCode ?? '-'})`;

function Stat({ label, value, color, last }: { label: string; value: string; color?: string; last?: boolean }) {
  return (
    <View style={[styles.stat, !last && styles.statBorder]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function PillAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && { backgroundColor: colors.tealTint }]}>
      <Ionicons name={icon} size={15} color={colors.teal} />
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

function MenuRow({ icon, label, sub, onPress, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, !last && styles.menuBorder, pressed && { backgroundColor: colors.tealTint }]}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={18} color={colors.tealDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.chevron} />
    </Pressable>
  );
}

export default function ProfilScreen() {
  const me = useMe();
  const commissions = useCommissions();
  const claim = useClaimCommissions();
  const signOut = useAuth((s) => s.signOut);
  const router = useRouter();

  if (me.isLoading) return <Screen title="Profil" back={false}><Loading /></Screen>;
  if (me.isError) return <Screen title="Profil" back={false}><ErrorView message={(me.error as Error).message} onRetry={() => me.refetch()} /></Screen>;
  const a = me.data!;
  const unclaimed = commissions.data?.unclaimedTotal ?? 0;

  return (
    <Screen title="Profil" back={false} padded={false}>
      <ScrollView contentContainerStyle={{ padding: size.gutter, paddingBottom: 32 }}>
        {/* ID card */}
        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <View style={styles.idStrip}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{a.name.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.idName} numberOfLines={1}>{a.name}</Text>
              <Text style={styles.idMeta} numberOfLines={1}>{a.phone}{a.email ? ` · ${a.email}` : ''}</Text>
              <Text style={styles.idMeta} numberOfLines={1}>{a.nik ? `NIK ${a.nik}` : 'NIK belum diisi'}</Text>
            </View>
            <View style={styles.codePill}>
              <Text style={styles.codePillLabel}>KODE</Text>
              <Text style={styles.codePillValue}>{a.commisionUniqueId}</Text>
            </View>
          </View>
          <View style={{ padding: 12 }}>
            <View style={styles.panel}>
              <Stat label="Saldo" value={formatRp(a.saldo)} color={colors.tealDark} />
              <Stat label="Hutang" value={formatRp(a.hutang)} color={a.hutang > 0 ? colors.danger : undefined} />
              <Stat label="Poin" value={String(a.poin)} last />
            </View>
            <View style={styles.pillRow}>
              <PillAction icon="create-outline" label="Ubah profil" onPress={() => router.push('/mitra?edit=1')} />
              <PillAction icon="people-outline" label="Mitra" onPress={() => router.push('/mitra')} />
              <PillAction icon="time-outline" label="Riwayat saldo" onPress={() => router.push('/saldo')} />
            </View>
          </View>
        </Card>

        {/* Komisi */}
        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <SectionBand>Komisi Mitra</SectionBand>
          <View style={{ paddingHorizontal: 14 }}>
            <KeyValue label="Bisa diklaim" value={formatRp(unclaimed)} bold />
            <KeyValue label="Menunggu transaksi sukses" value={formatRp(commissions.data?.pendingTotal ?? 0)} />
            <KeyValue label="Total komisi diterima" value={formatRp(a.saldoKomisi)} last />
          </View>
          <View style={{ padding: 12, paddingTop: 4 }}>
            {claim.isError ? <Text style={{ color: colors.danger, fontSize: font.small, marginBottom: 8 }}>{(claim.error as Error).message}</Text> : null}
            {claim.isSuccess ? <Text style={{ color: colors.tealDark, fontSize: font.small, marginBottom: 8 }}>Komisi {formatRp(claim.data.claimed)} masuk ke saldo.</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => claim.mutate()} disabled={unclaimed <= 0 || claim.isPending} style={({ pressed }) => [styles.cta, (unclaimed <= 0 || claim.isPending) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
                <Text style={styles.ctaText}>{claim.isPending ? 'Memproses...' : 'Klaim Komisi'}</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/komisi')} style={({ pressed }) => [styles.ctaOutline, pressed && { backgroundColor: colors.tealTint }]}>
                <Text style={styles.ctaOutlineText}>Riwayat</Text>
              </Pressable>
            </View>
          </View>
        </Card>

        {/* Menu */}
        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <SectionBand>Akun</SectionBand>
          <MenuRow icon="people-outline" label="Mitra & kode referral" sub={`Bagikan kode ${a.commisionUniqueId}, markup ${formatRp(a.referralMarkup)}/trx`} onPress={() => router.push('/mitra')} />
          <MenuRow icon="swap-vertical-outline" label="Riwayat saldo" sub="Semua saldo masuk & keluar" onPress={() => router.push('/saldo')} />
          <MenuRow icon="wallet-outline" label="Riwayat top up saldo" onPress={() => router.push('/topup/history')} />
          <MenuRow icon="keypad-outline" label={a.hasPin ? 'Ubah PIN' : 'Buat PIN'} onPress={() => router.push('/pin')} />
          <MenuRow icon="create-outline" label="Ubah profil" sub="Nama, NIK, nomor HP" onPress={() => router.push('/mitra?edit=1')} last />
        </Card>

        <Button title="Keluar" variant="ghost" icon="log-out-outline" onPress={() => signOut()} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card }} />
        <Text style={styles.version}>Pulsa Juan versi {APP_VERSION}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  idStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C2430', padding: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 17 },
  idName: { color: colors.white, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  idMeta: { color: 'rgba(255,255,255,0.6)', fontSize: font.tiny, marginTop: 1 },
  codePill: { alignItems: 'flex-end', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.25)', paddingLeft: 12 },
  codePillLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '600', letterSpacing: 0.8 },
  codePillValue: { color: colors.accent, fontSize: font.small, fontWeight: '700', letterSpacing: 0.6, marginTop: 1 },
  panel: { flexDirection: 'row', backgroundColor: '#F0F2F4', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, marginBottom: 12 },
  stat: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  statBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  statLabel: { fontSize: font.tiny, color: colors.muted, fontWeight: '500' },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 3, letterSpacing: -0.3 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 32, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.subtle, backgroundColor: colors.card },
  pillText: { fontSize: font.tiny, fontWeight: '500', color: colors.ink2, marginLeft: 5 },
  cta: { flex: 1, height: 42, borderRadius: 10, backgroundColor: colors.tealDark, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  ctaOutline: { flex: 1, height: 42, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.subtle, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  ctaOutlineText: { color: colors.ink2, fontSize: 13, fontWeight: '600' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  menuBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  menuIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuLabel: { fontSize: font.rowLabel, fontWeight: '500', color: colors.ink },
  menuSub: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  version: { textAlign: 'center', fontSize: font.tiny, color: colors.subtle, marginTop: 14 },
});
