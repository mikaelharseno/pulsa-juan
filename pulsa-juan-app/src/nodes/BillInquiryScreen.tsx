import { useMutation } from '@tanstack/react-query';
import { BillInquiry, collectedCustomerId, formatRp, InquiryResult } from 'pulsa-juan-common';
import React, { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { post } from '../api/client';
import { Button, Card, ErrorView, KeyValue, Loading } from '../components/ui';
import { colors, font } from '../theme';
import { NodeRendererProps } from './types';

export default function BillInquiryScreen({ node, segmentId, session, markupTotal, onComplete }: NodeRendererProps) {
  const n = node as BillInquiry;
  const customerId = collectedCustomerId(session.steps);
  const inquiry = useMutation({
    mutationFn: () => post<InquiryResult>('/agent/inquiries', { segmentId, nodeId: n.id, customerId }),
  });
  useEffect(() => {
    if (customerId) inquiry.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (!customerId) return <ErrorView message="ID pelanggan belum diisi" />;
  if (inquiry.isPending || inquiry.isIdle) return <Loading text="Mengecek tagihan..." />;
  if (inquiry.isError) return <ErrorView message={(inquiry.error as Error).message} onRetry={() => inquiry.mutate()} />;
  const r = inquiry.data!;
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
          onComplete({ nodeId: n.id, type: 'BillInquiry', customerId: r.customerId, amountDue: r.amountDue, customerName: r.customerName, periode: r.periode })
        }
      />
    </ScrollView>
  );
}
