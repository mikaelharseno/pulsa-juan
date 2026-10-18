import { useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHome } from '../../src/api/hooks';
import { AccountCard, BannerCarousel, CsRow, HomeHeader, ServicesGrid } from '../../src/components/home';
import { ErrorView, Loading } from '../../src/components/ui';
import { colors, size } from '../../src/theme';

export default function HomeScreen() {
  const home = useHome();
  const router = useRouter();
  if (home.isLoading) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><Loading /></SafeAreaView>;
  if (home.isError) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><ErrorView message={(home.error as Error).message} onRetry={() => home.refetch()} /></SafeAreaView>;
  const d = home.data!;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tealHeader }} edges={['top']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => home.refetch()} tintColor={colors.white} />}
      >
        <HomeHeader name={d.agent.name} todayTransactions={d.todayTransactions ?? 0} onProfile={() => router.push('/(tabs)/profil')} />
        <AccountCard saldo={d.saldo} hutang={d.hutang} poin={d.poin} commissionUnclaimed={d.commissionUnclaimed ?? 0} saldoKomisi={d.agent.saldoKomisi} />
        <View style={{ paddingHorizontal: size.gutter }}>
          <BannerCarousel banners={d.banners} />
          <ServicesGrid segments={d.segments} />
          <CsRow whatsapp={d.cs.whatsapp} telegram={d.cs.telegram} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
