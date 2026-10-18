import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatRp } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAgentConfig, useSelectBank, useTopUp } from '../../../src/api/hooks';
import { Button, Card, ErrorView, Loading, Screen, SectionBand } from '../../../src/components/ui';
import { colors, font } from '../../../src/theme';

const BANK_STYLE: Record<string, { fg: string }> = {
  BCA: { fg: '#0060AF' },
  BRI: { fg: '#00529C' },
};

export default function TopUpBankScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const order = useTopUp(id);
  const config = useAgentConfig();
  const select = useSelectBank(id);
  const [bank, setBank] = useState<'BRI' | 'BCA' | null>(order.data?.bank ?? null);
  const accounts = config.data?.bankAccounts ?? [];

  if (order.isLoading) return <Screen title="Pilih Pembayaran"><Loading /></Screen>;
  if (order.isError) return <Screen title="Pilih Pembayaran"><ErrorView message={(order.error as Error).message} onRetry={() => order.refetch()} /></Screen>;

  return (
    <Screen title="Pilih Pembayaran">
      <ScrollView>
        <View style={{ backgroundColor: colors.field, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14 }}>
          <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 2 }}>Jumlah Deposit</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 20, color: colors.ink2, fontWeight: '300', marginRight: 2 }}>Rp</Text>
            <Text style={{ color: colors.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.8 }}>{formatRp(order.data!.amount).replace('Rp ', '')}</Text>
          </View>
        </View>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <SectionBand>Bank</SectionBand>
          {accounts.length === 0 ? <Text style={{ padding: 16, color: colors.muted }}>Rekening bank belum tersedia. Hubungi CS.</Text> : null}
          {accounts.map((a, i) => {
            const st = BANK_STYLE[a.bank];
            const selected = bank === a.bank;
            return (
              <Pressable key={a.bank} onPress={() => setBank(a.bank)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 15, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.hairline, backgroundColor: selected ? colors.tealTint : colors.card }}>
                <View style={{ width: 64, height: 30, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  <Text style={{ color: st.fg, fontWeight: '800', fontSize: 12, letterSpacing: 0.5, fontStyle: 'italic' }}>{a.bank}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: font.rowLabel, color: colors.ink, fontWeight: '500' }}>Bank {a.bank}</Text>
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.teal : colors.chevron} />
              </Pressable>
            );
          })}
        </Card>
        {select.isError ? <Text style={{ color: colors.danger, marginTop: 8 }}>{(select.error as Error).message}</Text> : null}
        <View style={{ height: 16 }} />
        <Button title="Lanjut" disabled={!bank} loading={select.isPending} onPress={() => bank && select.mutate(bank, { onSuccess: () => router.replace(`/topup/${id}/pay`) })} />
      </ScrollView>
    </Screen>
  );
}
