import React, { useState } from 'react';
import { Text } from 'react-native';

import { useSetReferrer } from '../api/hooks';
import { colors } from '../theme';
import { Button, Field } from './ui';

/** Inviter code entry (only while the agent has no upline). */
export function ReferrerForm({ onDone }: { onDone?: (uplineName: string) => void }) {
  const [code, setCode] = useState('');
  const set = useSetReferrer();
  return (
    <>
      <Field
        label="Kode referral pengajak"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
        autoCapitalize="characters"
        placeholder="Contoh: AB12CD34"
        testID="referrer-code"
      />
      {set.isError ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{(set.error as Error).message}</Text> : null}
      <Button title="Simpan kode" disabled={code.length < 4} loading={set.isPending} onPress={() => set.mutate(code, { onSuccess: (m) => onDone?.(m.parent?.name ?? code) })} />
    </>
  );
}
