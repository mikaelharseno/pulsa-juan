import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatRp } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useClaimTopUp, useTopUp } from '../../../src/api/hooks';
import { openExternal } from '../../../src/components/home';
import { Button, Card, ErrorView, KeyValue, Loading, Screen, StatusPill } from '../../../src/components/ui';
import { colors, font } from '../../../src/theme';

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: colors.muted, fontSize: font.small }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', flexShrink: 1, letterSpacing: -0.4 }}>{value}</Text>
        <Pressable
          onPress={async () => {
            await Clipboard.setStringAsync(value.replace(/[^\d]/g, '') || value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
        >
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 4, fontSize: font.small }}>{copied ? 'Tersalin' : 'Salin'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TopUpPayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const order = useTopUp(id);
  const claim = useClaimTopUp(id);

  if (order.isLoading) return <Screen title="Transfer Bank"><Loading /></Screen>;
  if (order.isError) return <Screen title="Transfer Bank"><ErrorView message={(order.error as Error).message} onRetry={() => order.refetch()} /></Screen>;
  const o = order.data!;
  const claimed = o.status === 'CLAIMED';
  const done = o.status === 'PAID' || o.status === 'REJECTED' || o.status === 'EXPIRED';

  return (
    <Screen title="Transfer Bank">
      <ScrollView>
        <Card style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: font.rowLabel, fontWeight: '600', color: colors.ink }}>Top up #{o.orderNumber}</Text>
            <StatusPill status={o.status} />
          </View>
          <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 6 }}>
            Transfer ke rekening berikut, lalu tekan "Saya Sudah Bayar". Saldo bertambah setelah pembayaran kami verifikasi.
          </Text>
          {o.account ? (
            <>
              <Text style={{ color: colors.ink, fontSize: font.body, marginTop: 12, fontWeight: '600' }}>
                Bank {o.account.bank} — a.n. {o.account.accountName}
              </Text>
              <CopyRow label="Nomor rekening" value={o.account.accountNumber} />
            </>
          ) : null}
          <CopyRow label="Jumlah yang harus ditransfer" value={formatRp(o.totalTransfer)} />
          <Text style={{ color: colors.accent, fontSize: font.small, marginTop: 8, fontWeight: '600' }}>
            Sudah termasuk kode unik {o.kodeUnik} — transfer tepat sampai 3 digit terakhir agar pembayaran cepat kami kenali.
          </Text>
        </Card>
        <Card style={{ marginBottom: 12 }}>
          <KeyValue label="Nominal deposit" value={formatRp(o.amount)} />
          <KeyValue label="Kode unik" value={String(o.kodeUnik)} />
          <KeyValue label="Total transfer" value={formatRp(o.totalTransfer)} bold />
        </Card>
        {claim.isError ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{(claim.error as Error).message}</Text> : null}
        {done ? (
          <Button title="Kembali ke Beranda" onPress={() => router.replace('/(tabs)')} />
        ) : (
          <>
            <Button
              title={claimed ? 'Kirim ulang konfirmasi WhatsApp' : 'Saya Sudah Bayar'}
              loading={claim.isPending}
              onPress={() =>
                claim.mutate(undefined, {
                  onSuccess: (data) => {
                    if (data.waUrl) openExternal(data.waUrl);
                  },
                })
              }
            />
            {claimed ? (
              <>
                <Text style={{ color: colors.muted, fontSize: font.small, textAlign: 'center', marginTop: 10 }}>
                  Konfirmasi terkirim. Admin akan memeriksa mutasi bank lalu menambah saldo Anda.
                </Text>
                <Button title="Kembali ke Beranda" variant="outline" style={{ marginTop: 12 }} onPress={() => router.replace('/(tabs)')} />
              </>
            ) : null}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}
