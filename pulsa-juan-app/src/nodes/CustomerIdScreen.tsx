import { CustomerIdInput, validateStepInput } from 'pulsa-juan-common';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { Button, Field } from '../components/ui';
import { colors, font } from '../theme';
import { NodeRendererProps } from './types';

export default function CustomerIdScreen({ node, packages, prefixes, session, onComplete }: NodeRendererProps) {
  const n = node as CustomerIdInput;
  const prior = session.steps.find((s) => s.nodeId === n.id);
  const [values, setValues] = useState<{ customerId: string; secondaryId?: string }>(
    prior && prior.type === 'CustomerIdInput' ? prior.values : { customerId: '', secondaryId: '' },
  );
  const touched = values.customerId.length > 0 || (values.secondaryId ?? '').length > 0;
  const error = useMemo(() => {
    if (!touched) return null;
    return validateStepInput(n, { nodeId: n.id, type: 'CustomerIdInput', values }, { packages, prefixes }, session.steps)?.message ?? null;
  }, [values, touched, n, packages, prefixes, session.steps]);
  const canNext = touched && !error;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      {n.subtitle ? <Text style={{ color: colors.muted, fontSize: font.body, marginBottom: 12 }}>{n.subtitle}</Text> : null}
      {n.fields.map((f, i) => (
        <Field
          key={f.key}
          label={f.label + (f.required ? '' : ' (opsional)')}
          value={values[f.key] ?? ''}
          onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
          keyboardType={f.keyboard === 'numeric' ? 'number-pad' : 'default'}
          placeholder={f.placeholder}
          autoFocus={i === 0}
          hint={f.helpText}
          maxLength={f.maxLength}
          autoCapitalize="none"
        />
      ))}
      {error ? <Text style={{ color: colors.danger, fontSize: font.small, marginBottom: 12 }}>{error}</Text> : null}
      <Button title="Lanjut" disabled={!canNext} onPress={() => onComplete({ nodeId: n.id, type: 'CustomerIdInput', values })} />
    </ScrollView>
  );
}
