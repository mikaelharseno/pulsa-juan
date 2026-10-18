import { EnterAmount, formatNumberId, formatRp, parseRp, validateStepInput } from 'pulsa-juan-common';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { AmountField, Button, Chip } from '../components/ui';
import { colors, font } from '../theme';
import { NodeRendererProps } from './types';

export default function EnterAmountScreen({ node, packages, prefixes, markupTotal, session, onComplete }: NodeRendererProps) {
  const n = node as EnterAmount;
  const prior = session.steps.find((s) => s.nodeId === n.id);
  const [raw, setRaw] = useState(prior && prior.type === 'EnterAmount' ? formatNumberId(prior.amount) : '');
  const amount = parseRp(raw);
  const error = useMemo(() => {
    if (!raw) return null;
    const err = validateStepInput(n, { nodeId: n.id, type: 'EnterAmount', amount }, { packages, prefixes }, session.steps);
    return err?.message ?? null;
  }, [raw, amount, n, packages, prefixes, session.steps]);
  const canNext = !!raw && !error;
  const extras = n.adminFee + markupTotal;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      {n.subtitle ? <Text style={{ color: colors.muted, fontSize: font.body, marginBottom: 12 }}>{n.subtitle}</Text> : null}
      <AmountField label={n.label} value={amount} onChange={(v) => setRaw(v ? String(v) : '')} placeholder={n.min} autoFocus error={error} hint={`Minimal ${formatRp(n.min)}, maksimal ${formatRp(n.max)}, kelipatan ${formatRp(n.step)}`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
        {n.quickAmounts.map((q) => (
          <Chip key={q} icon="add-circle-outline" label={formatNumberId(q)} selected={amount === q} onPress={() => setRaw(String(q))} />
        ))}
      </View>
      {extras > 0 ? (
        <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 12 }}>
          Biaya admin {formatRp(extras)} akan ditambahkan. Total dipotong dari saldo: {canNext ? formatRp(amount + extras) : '-'}
        </Text>
      ) : null}
      <Button title="Lanjut" disabled={!canNext} onPress={() => onComplete({ nodeId: n.id, type: 'EnterAmount', amount })} />
    </ScrollView>
  );
}
