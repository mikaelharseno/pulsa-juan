import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { formatRp, toInternationalMobile } from 'pulsa-juan-common';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SegmentSummary } from '../api/types';
import { ServiceTile } from '../icons/ServiceIcon';
import { colors, font, shadow, size, track } from '../theme';

export function openExternal(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank');
  else Linking.openURL(url).catch(() => {});
}

/** Dark teal band behind the greeting; the account card overlaps it. */
export function HomeHeader({ name, todayTransactions, onProfile }: { name: string; todayTransactions: number; onProfile: () => void }) {
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  return (
    <View style={styles.hero}>
      <View style={styles.heroRow}>
        <Pressable onPress={onProfile} style={styles.avatar} accessibilityLabel="Profil">
          <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.heroGreet}>{greet}</Text>
          <Text style={styles.heroName} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <View style={styles.trxPill}>
          <Text style={styles.trxPillText}>{todayTransactions} Trx</Text>
          <Text style={styles.trxPillSub}>hari ini</Text>
        </View>
      </View>
    </View>
  );
}

function CardTab({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Ionicons name={icon} size={14} color={active ? colors.accent : 'rgba(255,255,255,0.55)'} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PillAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pillAction, pressed && { backgroundColor: colors.tealTint }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={15} color={colors.teal} />
      <Text style={styles.pillActionText}>{label}</Text>
    </Pressable>
  );
}

export function AccountCard({ saldo, hutang, poin, commissionUnclaimed, saldoKomisi }: { saldo: number; hutang: number; poin: number; commissionUnclaimed: number; saldoKomisi: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<'saldo' | 'komisi'>('saldo');
  const amount = tab === 'saldo' ? saldo : commissionUnclaimed;
  return (
    <View style={styles.account}>
      <View style={styles.tabs}>
        <CardTab icon="add-circle" label="ISI SALDO" active={tab === 'saldo'} onPress={() => setTab('saldo')} />
        <CardTab icon="gift" label="KOMISI" active={tab === 'komisi'} onPress={() => setTab('komisi')} />
      </View>
      <View style={styles.accountBody}>
        <View style={styles.panel}>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelLabel}>{tab === 'saldo' ? 'Saldo Akun' : 'Komisi bisa diklaim'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
              <Text style={styles.rp}>Rp</Text>
              <Text style={styles.amount}>{formatRp(amount).replace('Rp ', '')}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {tab === 'saldo' ? (
              <>
                <Text style={styles.panelMeta}>Poin</Text>
                <Text style={styles.panelMetaValue}>{poin}</Text>
                {hutang > 0 ? <Text style={styles.hutang}>Hutang {formatRp(hutang)}</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.panelMeta}>Total diterima</Text>
                <Text style={styles.panelMetaValue}>{formatRp(saldoKomisi)}</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.pillRow}>
          <PillAction icon="add-circle-outline" label="Top Up" onPress={() => router.push('/topup/amount')} />
          <PillAction icon="time-outline" label="Riwayat" onPress={() => router.push('/topup/history')} />
          <PillAction icon="gift-outline" label="Komisi" onPress={() => router.push('/komisi')} />
          <PillAction icon="people-outline" label="Mitra" onPress={() => router.push('/mitra')} />
        </View>
        <Pressable onPress={() => router.push(tab === 'saldo' ? '/topup/amount' : '/komisi')} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={styles.ctaText}>{tab === 'saldo' ? 'Isi Saldo' : 'Klaim Komisi'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const AUTOPLAY_MS = 2000;
const BANNER_RATIO = 2.4;

export function BannerCarousel({ banners }: { banners: { imageUrl: string; linkUrl?: string }[] }) {
  const [width, setWidth] = useState(Dimensions.get('window').width - size.gutter * 2);
  const height = Math.round(width / BANNER_RATIO);
  const list = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => {
      if (paused.current) return;
      setIndex((i) => {
        const next = (i + 1) % banners.length;
        list.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [banners.length]);

  if (banners.length === 0) return null;
  return (
    <View style={{ marginBottom: 20 }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <FlatList
        key={width}
        ref={list}
        data={banners}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onTouchStart={() => (paused.current = true)}
        onTouchEnd={() => (paused.current = false)}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Pressable onPress={() => item.linkUrl && openExternal(item.linkUrl)} style={{ width }}>
            <Image source={{ uri: item.imageUrl }} style={{ width, height, borderRadius: size.bannerRadius, backgroundColor: colors.divider }} contentFit="cover" />
          </Pressable>
        )}
      />
      <View style={styles.dots}>
        {banners.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

export function ServiceCell({ label, iconUrl, slug, badge, onPress }: { label: string; iconUrl?: string | null; slug?: string; badge?: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={label}>
      <View>
        <ServiceTile iconUrl={iconUrl} slug={slug} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cellLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Every service in one section, orderkuota-style. */
export function ServicesGrid({ segments }: { segments: SegmentSummary[] }) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Semua Layanan</Text>
        <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.teal, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ color: colors.tealDark, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.2 }}>{segments.length} LAYANAN</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {segments.map((s) => (
          <ServiceCell key={s.id} label={s.label} iconUrl={s.iconUrl} slug={s.slug} badge={s.badge} onPress={() => router.push(`/segment/${s.id}`)} />
        ))}
      </View>
    </View>
  );
}

function HelpCard({ icon, color, tint, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: string; tint: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.help, pressed && { backgroundColor: colors.tealTint }]}>
      <View style={[styles.helpIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpSub}>{sub}</Text>
      </View>
      <Ionicons name="arrow-forward" size={16} color={colors.subtle} />
    </Pressable>
  );
}

export function CsRow({ whatsapp, telegram }: { whatsapp: string; telegram: string }) {
  const wa = toInternationalMobile(whatsapp);
  const tg = telegram.replace(/^@/, '');
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Bantuan</Text>
      </View>
      <View style={{ gap: 10 }}>
        <HelpCard icon="logo-whatsapp" color="#16A34A" tint="#DCFCE7" title="CS WhatsApp" sub="Chat cepat untuk konfirmasi & kendala" onPress={() => wa && openExternal(`https://wa.me/${wa}`)} />
        <HelpCard icon="paper-plane" color="#2563EB" tint="#DBEAFE" title="CS Telegram" sub="Alternatif bila WhatsApp sibuk" onPress={() => tg && openExternal(`https://t.me/${tg}`)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.tealHeader, paddingHorizontal: size.gutter, paddingTop: 10, paddingBottom: 56 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroGreet: { color: 'rgba(255,255,255,0.7)', fontSize: font.tiny, fontWeight: '500', letterSpacing: 0.2 },
  heroName: { color: colors.white, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, marginTop: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  trxPill: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  trxPillText: { color: colors.white, fontSize: font.small, fontWeight: '700' },
  trxPillSub: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginLeft: 4 },

  account: { backgroundColor: colors.card, borderRadius: 14, marginTop: -40, marginHorizontal: size.gutter, marginBottom: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden', ...shadow.float },
  tabs: { flexDirection: 'row', backgroundColor: '#1C2430' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: 'rgba(255,255,255,0.6)', fontSize: font.tiny, fontWeight: '600', letterSpacing: 0.6, marginLeft: 6 },
  tabTextActive: { color: colors.white },
  accountBody: { padding: 12 },
  panel: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F4', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  panelLabel: { fontSize: font.small, color: colors.muted, fontWeight: '500' },
  rp: { fontSize: 15, color: colors.ink2, fontWeight: '400', marginRight: 2 },
  amount: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  panelMeta: { fontSize: font.tiny, color: colors.muted },
  panelMetaValue: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 1 },
  hutang: { fontSize: 10.5, color: colors.danger, fontWeight: '600', marginTop: 2 },
  pillRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  pillAction: { flexDirection: 'row', alignItems: 'center', height: 32, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.subtle, backgroundColor: colors.card, paddingHorizontal: 10 },
  pillActionText: { fontSize: font.tiny, fontWeight: '500', color: colors.ink2, marginLeft: 5 },
  cta: { height: 42, borderRadius: 10, backgroundColor: colors.tealDark, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  dot: { width: size.dot, height: size.dot, borderRadius: size.dot / 2, backgroundColor: colors.border, marginHorizontal: 3 },
  dotActive: { backgroundColor: colors.ink, width: 18 },

  section: { marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: font.h2, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '25%', alignItems: 'center', paddingHorizontal: 4, marginBottom: 16 },
  cellLabel: { fontSize: font.gridLabel, fontWeight: '500', color: colors.ink2, textAlign: 'center', marginTop: 7, lineHeight: 14 },
  badge: { position: 'absolute', top: -6, right: -8, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: colors.white, fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },

  help: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: size.cardRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 13, ...shadow.card },
  helpIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  helpTitle: { fontSize: font.rowLabel, fontWeight: '600', color: colors.ink, letterSpacing: -0.1 },
  helpSub: { fontSize: font.small, color: colors.muted, marginTop: 2 },
});
