import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHome, useTopUps } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/useAuth';
import { AccountCard, BannerCarousel, CsRow, HomeHeader, PendingTopUpCard, ServicesGrid, waitingTopUp } from '../../src/components/home';
import { ErrorView, Loading } from '../../src/components/ui';
import { colors, font, size } from '../../src/theme';

export default function HomeScreen() {
  const home = useHome();
  const topUps = useTopUps();
  const router = useRouter();
  const askReferrer = useAuth((s) => s.askReferrer);
  const setAskReferrer = useAuth((s) => s.setAskReferrer);
  useEffect(() => {
    if (!askReferrer) return;
    setAskReferrer(false);
    router.push('/pengajak');
  }, [askReferrer, setAskReferrer, router]);
  if (home.isLoading) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><Loading /></SafeAreaView>;
  if (home.isError) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><ErrorView message={(home.error as Error).message} onRetry={() => home.refetch()} /></SafeAreaView>;
  const d = home.data!;
  const pending = waitingTopUp(topUps.data);
  const refresh = () => {
    home.refetch();
    topUps.refetch();
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tealHeader }} edges={['top']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={refresh} tintColor={colors.white} />}
      >
        <HomeHeader name={d.agent.name} todayTransactions={d.todayTransactions ?? 0} onProfile={() => router.push('/(tabs)/profil')} />
        <AccountCard saldo={d.saldo} hutang={d.hutang} poin={d.poin} commissionUnclaimed={d.commissionUnclaimed ?? 0} saldoKomisi={d.agent.saldoKomisi} onRefresh={refresh} refreshing={home.isRefetching} />
        <View style={{ paddingHorizontal: size.gutter }}>
          {d.agent.saldoFrozen ? (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginTop: 12 }}>
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.body }}>Saldo Anda sedang dibekukan</Text>
              <Text style={{ color: colors.ink, fontSize: font.small, marginTop: 4 }}>
                {d.agent.saldoFrozen.reason ? `Alasan: ${d.agent.saldoFrozen.reason}. ` : ''}Pembelian, transfer saldo dan klaim komisi ditahan sementara. Hubungi CS untuk bantuan.
              </Text>
            </View>
          ) : null}
          {pending ? <PendingTopUpCard topUp={pending} /> : null}
          <BannerCarousel banners={d.banners} />
          <ServicesGrid segments={d.segments} verified={d.agent.kycStatus === 'VERIFIED'} />
          <CsRow whatsapp={d.cs.whatsapp} telegram={d.cs.telegram} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
