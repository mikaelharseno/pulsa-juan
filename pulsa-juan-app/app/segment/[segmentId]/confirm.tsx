import { useMutation } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { computeTotal, describeSteps, formatRp } from 'pulsa-juan-common';
import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ApiError, post } from '../../../src/api/client';
import { useAgentConfig, useInvalidateMoney, useMe, useSavedSellPrices, useSellMargins, useTree } from '../../../src/api/hooks';
import { Transaction } from '../../../src/api/types';
import { PinSheet } from '../../../src/components/PinSheet';
import { Button, Card, ErrorView, KeyValue, Loading, Screen, SectionTitle } from '../../../src/components/ui';
import { useFlowSession, useFlowStore } from '../../../src/flow/useFlowStore';
import { colors, font } from '../../../src/theme';

export default function ConfirmScreen() {
  const { segmentId } = useLocalSearchParams<{ segmentId: string }>();
  const router = useRouter();
  const tree = useTree(segmentId);
  const config = useAgentConfig();
  const me = useMe();
  const session = useFlowSession(segmentId);
  const clear = useFlowStore((s) => s.clear);
  const invalidate = useInvalidateMoney();
  const [idempotencyKey] = useState(() => Crypto.randomUUID());
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  const [showCost, setShowCost] = useState(false);
  const [lost, setLost] = useState(false);
  const margins = useSellMargins();
  const savedPrices = useSavedSellPrices();

  const submit = useMutation({
    mutationFn: async ({ clientTotal, pin }: { clientTotal: number; pin: string }) => {
      const body = { segmentId, treeVersion: session!.treeVersion, steps: session!.steps, clientTotal, idempotencyKey, pin };
      setLost(false);
      // a dropped connection must never look like a failed sale: the same key returns the order if it was made
      for (let attempt = 0; ; attempt++) {
        try {
          return await post<{ transaction: Transaction }>('/agent/transactions', body);
        } catch (e) {
          if (e instanceof ApiError || attempt >= 3) {
            if (!(e instanceof ApiError)) setLost(true);
            throw e;
          }
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    },
    onSuccess: ({ transaction }) => {
      setPinOpen(false);
      clear(segmentId);
      invalidate();
      router.replace(`/transaction/${transaction.id}/result`);
    },
    onError: (e) => {
      // a wrong PIN stays in the sheet for another try; anything else is shown on the page
      if (!(e instanceof ApiError && e.code === 'PIN_INVALID')) setPinOpen(false);
      if (e instanceof ApiError && e.code === 'PIN_REQUIRED') me.refetch();
      if (e instanceof ApiError && e.code === 'PRICE_CHANGED') setServerTotal(e.extra.total as number);
      if (e instanceof ApiError && e.code === 'TREE_OUTDATED') {
        clear(segmentId);
        tree.refetch();
        router.replace(`/segment/${segmentId}`);
      }
    },
  });

  const view = useMemo(() => {
    if (!tree.data || !session || session.steps.length === 0) return null;
    const ctx = { prefixes: config.data?.prefixes ?? [], packages: tree.data.packages };
    try {
      const price = computeTotal(session.steps, tree.data.tree, ctx, tree.data.markupTotal);
      const rows = describeSteps(session.steps, tree.data.tree, ctx);
      return { price, rows };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [tree.data, session, config.data]);

  if (tree.isLoading || me.isLoading) return <Screen title="Konfirmasi"><Loading /></Screen>;
  if (!session || !view) return <Screen title="Konfirmasi"><ErrorView message="Sesi transaksi tidak ditemukan" onRetry={() => router.replace(`/segment/${segmentId}`)} /></Screen>;
  if ('error' in view) return <Screen title="Konfirmasi"><ErrorView message={view.error!} /></Screen>;

  const total = serverTotal ?? view.price!.total;
  // what the agent's customer pays (saved product price, else cost + margin): shown instead of the cost
  const packageId = view.price!.packageId ?? null;
  const saved = packageId ? savedPrices.data?.find((x) => x.packageId === packageId) : undefined;
  const m = margins.data;
  const sellPrice = saved?.sellPrice ?? total + (m ? (m.bySegment[tree.data!.segment.id] ?? m.default) : 0);
  const cs = config.data?.cs?.whatsapp;
  const saldo = me.data?.saldo ?? 0;
  const enough = saldo >= total;
  const pinError = submit.error instanceof ApiError && submit.error.code === 'PIN_INVALID' ? submit.error.message + (typeof submit.error.extra.attemptsLeft === 'number' ? ` (sisa ${submit.error.extra.attemptsLeft} kali)` : '') : null;
  const errorMsg = submit.error instanceof ApiError && submit.error.code !== 'PRICE_CHANGED' && submit.error.code !== 'PIN_INVALID' ? submit.error.message : null;

  return (
    <Screen title="Konfirmasi">
      <ScrollView>
        <Card style={{ marginBottom: 12 }}>
          <SectionTitle>{tree.data!.segment.label}</SectionTitle>
          {view.rows!.map((r, i) => (
            <KeyValue key={i} label={r.label} value={r.value} />
          ))}
        </Card>
        <Card style={{ marginBottom: 12 }}>
          <KeyValue label="Harga" value={formatRp(sellPrice)} bold last={!showCost} />
          {showCost ? (
            <>
              <KeyValue label="Modal" value={formatRp(view.price!.amountBase)} />
              {view.price!.adminFee + view.price!.markupTotal > 0 ? <KeyValue label="Biaya Admin" value={formatRp(view.price!.adminFee + view.price!.markupTotal)} /> : null}
              <KeyValue label="Dipotong dari saldo" value={formatRp(total)} />
              <KeyValue label="Saldo Anda" value={formatRp(saldo)} />
              <KeyValue label="Saldo setelah transaksi" value={formatRp(saldo - total)} last />
            </>
          ) : null}
          <Pressable onPress={() => setShowCost(!showCost)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Ionicons name={showCost ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.tealDark} />
            <Text style={{ color: colors.tealDark, fontSize: font.small, fontWeight: '600' }}>{showCost ? 'Sembunyikan rincian saldo' : 'Lihat rincian saldo'}</Text>
          </Pressable>
        </Card>
        {serverTotal !== null ? <Text style={{ color: colors.accent, marginBottom: 8, fontSize: font.small }}>Harga berubah menjadi {formatRp(serverTotal)}. Periksa kembali lalu tekan Bayar.</Text> : null}
        {!enough ? <Text style={{ color: colors.danger, marginBottom: 8 }}>Saldo tidak cukup. Silakan isi saldo terlebih dahulu.</Text> : null}
        {lost ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>Sedang diproses</Text>
            <Text style={{ color: colors.muted, fontSize: font.body, marginBottom: 10 }}>Koneksi terputus saat mengirim pesanan. Pesanan Anda mungkin sudah masuk dan sedang diproses: cek menu Riwayat sebelum mencoba lagi, atau hubungi CS.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Cek Riwayat" variant="outline" style={{ flex: 1 }} onPress={() => router.replace('/(tabs)/transaksi')} />
              <Button
                title="Hubungi CS"
                style={{ flex: 1 }}
                disabled={!cs}
                onPress={() => Linking.openURL(`https://wa.me/${toWa(cs!)}?text=${encodeURIComponent(`Halo CS, koneksi saya terputus saat order ${tree.data!.segment.label} (kode ${idempotencyKey.slice(0, 8).toUpperCase()}). Mohon dicek apakah pesanan sudah masuk.`)}`)}
              />
            </View>
          </Card>
        ) : errorMsg ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{errorMsg}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!enough ? <Button title="Isi Saldo" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/topup/amount')} /> : null}
          <Button title="Bayar" style={{ flex: 1 }} disabled={!enough} loading={submit.isPending && !pinOpen} onPress={() => { submit.reset(); setPinOpen(true); }} />
        </View>
      </ScrollView>
      <PinSheet
        visible={pinOpen}
        hasPin={!!me.data?.hasPin}
        busy={submit.isPending}
        error={pinError}
        onClose={() => setPinOpen(false)}
        onSubmit={(pin) => submit.mutate({ clientTotal: total, pin })}
      />
    </Screen>
  );
}

/** 08xx → 628xx for wa.me */
function toWa(n: string) {
  const d = n.replace(/\D/g, '');
  return d.startsWith('0') ? '62' + d.slice(1) : d;
}
