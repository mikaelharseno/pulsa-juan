import { useMutation } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { formatRp } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { ApiError, post } from '../src/api/client';
import { useInvalidateMoney, useMe } from '../src/api/hooks';
import { PinSheet } from '../src/components/PinSheet';
import { Button, Card, Field, KeyValue, Screen } from '../src/components/ui';
import { colors, font } from '../src/theme';

interface Recipient { name: string; phone: string; code: string }

/** Kirim saldo ke agen lain: nomor HP / kode referral → cek nama → nominal → PIN. */
export default function TransferScreen() {
  const router = useRouter();
  const me = useMe();
  const invalidate = useInvalidateMoney();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [key] = useState(() => Crypto.randomUUID());
  const [done, setDone] = useState<{ number: number; saldo: number } | null>(null);

  const lookup = useMutation({ mutationFn: () => post<Recipient>('/agent/transfers/lookup', { to }), onSuccess: setRecipient });
  const send = useMutation({
    mutationFn: (pin: string) => post<{ transfer: { number: number }; saldo: number }>('/agent/transfers', { to: recipient!.code, amount: Number(amount), note: note || undefined, pin, idempotencyKey: key }),
    onSuccess: (r) => { setPinOpen(false); invalidate(); setDone({ number: r.transfer.number, saldo: r.saldo }); },
    onError: (e) => { if (!(e instanceof ApiError && e.code === 'PIN_INVALID')) setPinOpen(false); },
  });
  const saldo = me.data?.saldo ?? 0;
  const value = Number(amount) || 0;
  const frozen = me.data?.saldoFrozen;
  const pinError = send.error instanceof ApiError && send.error.code === 'PIN_INVALID' ? send.error.message : null;
  const sendError = send.error && !pinError ? (send.error as Error).message : null;

  if (done) {
    return (
      <Screen title="Transfer Saldo">
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 }}>Transfer berhasil</Text>
          <KeyValue label="No. transfer" value={'#' + done.number} />
          <KeyValue label="Penerima" value={recipient!.name} />
          <KeyValue label="Nominal" value={formatRp(value)} bold />
          <KeyValue label="Sisa saldo" value={formatRp(done.saldo)} last />
        </Card>
        <Button title="Kembali" style={{ marginTop: 12 }} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title="Transfer Saldo">
      <ScrollView keyboardShouldPersistTaps="handled">
        {frozen ? <Text style={{ color: colors.danger, marginBottom: 10 }}>Saldo Anda sedang dibekukan{frozen.reason ? `: ${frozen.reason}` : ''}.</Text> : null}
        <Card style={{ marginBottom: 12 }}>
          <Field
            label="Nomor HP / kode referral penerima"
            value={to}
            onChangeText={(v) => { setTo(v); setRecipient(null); lookup.reset(); }}
            autoCapitalize="characters"
            error={lookup.isError ? (lookup.error as Error).message : null}
          />
          {recipient ? (
            <>
              <KeyValue label="Penerima" value={recipient.name} bold />
              <KeyValue label="Nomor HP" value={recipient.phone} last />
            </>
          ) : (
            <Button title="Cek penerima" variant="outline" disabled={to.trim().length < 3} loading={lookup.isPending} onPress={() => lookup.mutate()} />
          )}
        </Card>
        {recipient ? (
          <Card style={{ marginBottom: 12 }}>
            <Field label="Nominal (Rp)" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} keyboardType="number-pad" error={value > saldo ? 'Saldo tidak cukup' : null} hint={`Saldo Anda ${formatRp(saldo)}`} />
            <Field label="Catatan (opsional)" value={note} onChangeText={setNote} maxLength={120} />
            {sendError ? <Text style={{ color: colors.danger, marginBottom: 8, fontSize: font.body }}>{sendError}</Text> : null}
            <Button title={value ? `Kirim ${formatRp(value)}` : 'Kirim'} disabled={!!frozen || value < 1000 || value > saldo} onPress={() => { send.reset(); setPinOpen(true); }} />
          </Card>
        ) : null}
      </ScrollView>
      <PinSheet visible={pinOpen} hasPin={!!me.data?.hasPin} busy={send.isPending} error={pinError} onClose={() => setPinOpen(false)} onSubmit={(pin) => send.mutate(pin)} />
    </Screen>
  );
}
