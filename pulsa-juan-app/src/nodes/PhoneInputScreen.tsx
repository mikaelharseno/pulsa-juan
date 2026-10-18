import {
  detectProvider,
  isValidIndoMobile,
  normalizeIndonesianMobile,
  PhoneNumberInput,
  PROVIDER_LABELS,
  resolveNext,
  validateStepInput,
} from 'pulsa-juan-common';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Field } from '../components/ui';
import { colors, font } from '../theme';
import { NodeRendererProps } from './types';

export default function PhoneInputScreen({ node, prefixes, packages, session, onComplete }: NodeRendererProps) {
  const n = node as PhoneNumberInput;
  const prior = session.steps.find((s) => s.nodeId === n.id);
  const [raw, setRaw] = useState(prior && prior.type === 'PhoneNumberInput' ? prior.phoneNumber : '');
  const normalized = normalizeIndonesianMobile(raw);
  const provider = detectProvider(normalized, prefixes);
  const ctx = { prefixes, packages };

  const { error, canNext } = useMemo(() => {
    if (!raw) return { error: null, canNext: false };
    if (!isValidIndoMobile(normalized)) return { error: normalized.length >= 10 ? 'Nomor HP tidak valid' : null, canNext: false };
    const step = { nodeId: n.id, type: 'PhoneNumberInput' as const, phoneNumber: normalized };
    const err = validateStepInput(n, step, ctx, session.steps);
    if (err) return { error: err.message, canNext: false };
    if (resolveNext(n, step, ctx) === null) return { error: 'Operator nomor belum didukung', canNext: false };
    return { error: null, canNext: true };
  }, [raw, normalized, n, prefixes, packages, session.steps]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      {n.subtitle ? <Text style={{ color: colors.muted, fontSize: font.body, marginBottom: 12 }}>{n.subtitle}</Text> : null}
      <Field
        label={n.label}
        value={raw}
        onChangeText={setRaw}
        keyboardType="phone-pad"
        placeholder="08xxxxxxxxxx"
        autoFocus
        error={error}
        hint={n.allowedProviders ? 'Khusus nomor ' + n.allowedProviders.map((p) => PROVIDER_LABELS[p]).join('/') : undefined}
        right={
          provider ? (
            <View style={{ backgroundColor: colors.primaryRing, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
              <Text style={{ color: colors.primaryDark, fontWeight: '700', fontSize: font.small }}>{PROVIDER_LABELS[provider]}</Text>
            </View>
          ) : null
        }
      />
      <Button title="Lanjut" disabled={!canNext} onPress={() => onComplete({ nodeId: n.id, type: 'PhoneNumberInput', phoneNumber: normalized })} />
    </ScrollView>
  );
}
