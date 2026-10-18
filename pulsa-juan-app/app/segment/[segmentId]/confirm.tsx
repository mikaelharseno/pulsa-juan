import { useMutation } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { computeTotal, describeSteps, formatRp } from 'pulsa-juan-common';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ApiError, post } from '../../../src/api/client';
import { useAgentConfig, useInvalidateMoney, useMe, useTree } from '../../../src/api/hooks';
import { Transaction } from '../../../src/api/types';
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

  const submit = useMutation({
    mutationFn: (clientTotal: number) =>
      post<{ transaction: Transaction }>('/agent/transactions', {
        segmentId,
        treeVersion: session!.treeVersion,
        steps: session!.steps,
        clientTotal,
        idempotencyKey,
      }),
    onSuccess: ({ transaction }) => {
      clear(segmentId);
      invalidate();
      router.replace(`/transaction/${transaction.id}/result`);
    },
    onError: (e) => {
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
  const saldo = me.data?.saldo ?? 0;
  const enough = saldo >= total;
  const errorMsg = submit.error instanceof ApiError && submit.error.code !== 'PRICE_CHANGED' ? submit.error.message : null;

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
          <KeyValue label="Harga" value={formatRp(view.price!.amountBase)} />
          {view.price!.adminFee + view.price!.markupTotal > 0 ? <KeyValue label="Biaya Admin" value={formatRp(view.price!.adminFee + view.price!.markupTotal)} /> : null}
          <KeyValue label="Total dipotong dari saldo" value={formatRp(total)} bold />
          <KeyValue label="Saldo Anda" value={formatRp(saldo)} />
          <KeyValue label="Saldo setelah transaksi" value={formatRp(saldo - total)} />
        </Card>
        {serverTotal !== null ? <Text style={{ color: colors.accent, marginBottom: 8, fontSize: font.small }}>Harga berubah menjadi {formatRp(serverTotal)}. Periksa kembali lalu tekan Bayar.</Text> : null}
        {!enough ? <Text style={{ color: colors.danger, marginBottom: 8 }}>Saldo tidak cukup. Silakan isi saldo terlebih dahulu.</Text> : null}
        {errorMsg ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{errorMsg}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!enough ? <Button title="Isi Saldo" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/topup/amount')} /> : null}
          <Button title="Bayar" style={{ flex: 1 }} disabled={!enough} loading={submit.isPending} onPress={() => submit.mutate(total)} />
        </View>
      </ScrollView>
    </Screen>
  );
}
