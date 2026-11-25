import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, size } from '../../src/theme';

const tab = (active: keyof typeof Ionicons.glyphMap, inactive: keyof typeof Ionicons.glyphMap) =>
  ({ color, focused }: { color: string; focused: boolean }) => <Ionicons name={focused ? active : inactive} size={size.tabIcon} color={color} />;

export default function TabsLayout() {
  // edge-to-edge: the app draws under Android's navigation bar (3 buttons ≈ 48dp), so the bar grows by the inset
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.subtle,
        tabBarLabelStyle: { fontSize: font.tiny, fontWeight: '600', marginTop: 2 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.divider, height: 56 + insets.bottom, paddingBottom: insets.bottom + 8, paddingTop: 8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda', tabBarIcon: tab('home', 'home-outline') }} />
      <Tabs.Screen name="transaksi" options={{ title: 'Transaksi', tabBarIcon: tab('receipt', 'receipt-outline') }} />
      <Tabs.Screen name="rekap" options={{ title: 'Rekap', tabBarIcon: tab('stats-chart', 'stats-chart-outline') }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: tab('person', 'person-outline') }} />
    </Tabs>
  );
}
