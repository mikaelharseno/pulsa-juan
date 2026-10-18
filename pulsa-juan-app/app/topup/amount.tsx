import { useRouter } from 'expo-router';
import { formatNumberId, formatRp, parseRp } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAgentConfig, useCreateTopUp } from '../../src/api/hooks';
import { AmountField, Button, Card, Chip, Screen } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

const QUICK = [50000, 100000, 200000, 500000];

export default function TopUpAmountScreen() {
  const router = useRouter();
  const config = useAgentConfig();
  const create = useCreateTopUp();
  const [raw, setRaw] = useState('');
  const amount = parseRp(raw);
  const min = config.data?.topUpMin ?? 10000;
  const max = config.data?.topUpMax ?? 5000000;
  const error = !raw ? null : amount < min ? `Minimal ${formatRp(min)}` : amount > max ? `Maksimal ${formatRp(max)}` : null;

  return (
    <Screen title="Isi Saldo">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <AmountField label="Jumlah Deposit" value={amount} onChange={(n) => setRaw(n ? String(n) : '')} placeholder={min} autoFocus error={error} hint={`Minimal ${formatRp(min)}, maksimal ${formatRp(max)}`} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            {QUICK.map((q) => (
              <Chip key={q} icon="add-circle-outline" label={formatNumberId(q)} selected={amount === q} onPress={() => setRaw(String(q))} />
            ))}
          </View>
          {create.isError ? <Text style={{ color: colors.danger, fontSize: font.small, marginBottom: 8 }}>{(create.error as Error).message}</Text> : null}
          <Button
            title="Pilih Pembayaran"
            disabled={!raw || !!error}
            loading={create.isPending}
            onPress={() => create.mutate(amount, { onSuccess: (order) => router.replace(`/topup/${order.id}/bank`) })}
          />
        </Card>
        <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 12, lineHeight: 18 }}>
          Setelah memilih bank, Anda akan mendapat nominal transfer dengan 3 digit kode unik agar pembayaran cepat kami kenali.
        </Text>
      </ScrollView>
    </Screen>
  );
}
