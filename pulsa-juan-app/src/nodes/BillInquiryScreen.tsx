import { BillInquiry, collectedCustomerId, formatRp } from 'pulsa-juan-common';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { get, post } from '../api/client';
import { BillCheckResponse } from '../api/types';
import { Button, Card, ErrorView, KeyValue, Loading } from '../components/ui';
import { colors, font } from '../theme';
import { NodeRendererProps } from './types';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 45_000;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; check: BillCheckResponse & { result: NonNullable<BillCheckResponse['result']> } }
  | { kind: 'stopped'; message: string };

/**
 * Starts a bill check; the bill may come back right away or later (OtomaX
 * report), so a PENDING check is polled every 2 s for up to ~45 s.
 */
export default function BillInquiryScreen({ node, segmentId, session, markupTotal, onComplete }: NodeRendererProps) {
  const n = node as BillInquiry;
  const customerId = collectedCustomerId(session.steps);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const run = useRef(0);

  const start = useCallback(async () => {
    if (!customerId) return;
    const me = ++run.current;
    setState({ kind: 'loading' });
    try {
      let check = await post<BillCheckResponse>('/agent/inquiries', { segmentId, nodeId: n.id, customerId });
      const started = Date.now();
      while (check.status === 'PENDING' && check.checkId && Date.now() - started < POLL_LIMIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (run.current !== me) return;
        check = await get<BillCheckResponse>(`/agent/inquiries/${check.checkId}`);
      }
      if (run.current !== me) return;
      if (check.status === 'READY' && check.result) setState({ kind: 'ready', check: { ...check, result: check.result } });
      else if (check.status === 'PENDING') setState({ kind: 'stopped', message: 'Tagihan belum terbaca. Coba cek ulang sebentar lagi.' });
      else setState({ kind: 'stopped', message: check.message ?? 'Cek tagihan gagal' });
    } catch (error) {
      if (run.current === me) setState({ kind: 'stopped', message: (error as Error).message });
    }
  }, [customerId, segmentId, n.id]);

  useEffect(() => {
    start();
    return () => {
      run.current++; // stop polling when leaving the screen
    };
  }, [start]);

  if (!customerId) return <ErrorView message="ID pelanggan belum diisi" />;
  if (state.kind === 'loading') return <Loading text="Mengecek tagihan..." />;
  if (state.kind === 'stopped') return <ErrorView message={state.message} onRetry={start} />;
  const r = state.check.result;
  const total = r.amountDue + r.adminFee + markupTotal;
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={{ fontSize: font.rowLabel, fontWeight: '700', color: colors.text, marginBottom: 8 }}>{n.title}</Text>
        <KeyValue label="ID Pelanggan" value={r.customerId} />
        {r.customerName ? <KeyValue label="Nama Pelanggan" value={r.customerName} /> : null}
        {r.periode ? <KeyValue label="Periode" value={r.periode} /> : null}
        <KeyValue label="Tagihan" value={formatRp(r.amountDue)} />
        <KeyValue label="Biaya Admin" value={formatRp(r.adminFee + markupTotal)} />
        <KeyValue label="Total" value={formatRp(total)} bold />
      </Card>
      <View style={{ height: 16 }} />
      <Button
        title="Lanjut"
        onPress={() =>
          onComplete({
            nodeId: n.id,
            type: 'BillInquiry',
            customerId: r.customerId,
            amountDue: r.amountDue,
            adminFee: r.adminFee,
            customerName: r.customerName,
            periode: r.periode,
            ...(state.check.checkId ? { checkId: state.check.checkId } : {}),
          })
        }
      />
    </ScrollView>
  );
}
