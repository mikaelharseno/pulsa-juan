import { useRouter } from 'expo-router';
import { isValidPin } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { useChangePin, useMe } from '../src/api/hooks';
import { Button, Card, CodeInput, Screen } from '../src/components/ui';
import { colors, font } from '../src/theme';

export default function ChangePinScreen() {
  const me = useMe();
  const change = useChangePin();
  const router = useRouter();
  const [oldPin, setOldPin] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const hasPin = me.data?.hasPin ?? true;
  const pinError = pin.length === 6 && !isValidPin(pin) ? 'PIN tidak boleh sama semua / berurutan' : null;
  const pin2Error = pin2.length === 6 && pin2 !== pin ? 'PIN tidak sama' : null;
  const valid = (!hasPin || oldPin.length === 6) && isValidPin(pin) && pin === pin2;

  return (
    <Screen title={hasPin ? 'Ubah PIN' : 'Buat PIN'}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 14 }}>PIN 6 angka dipakai untuk masuk ke aplikasi dengan nomor HP Anda.</Text>
          {hasPin ? <CodeInput label="PIN lama" secure value={oldPin} onChange={setOldPin} autoFocus /> : null}
          <CodeInput label="PIN baru" secure value={pin} onChange={setPin} error={pinError} />
          <CodeInput label="Ulangi PIN baru" secure value={pin2} onChange={setPin2} error={pin2Error} />
          {change.isError ? <Text style={{ color: colors.danger, marginBottom: 10 }}>{(change.error as Error).message}</Text> : null}
          {change.isSuccess ? <Text style={{ color: colors.tealDark, marginBottom: 10 }}>PIN berhasil diubah.</Text> : null}
          {change.isSuccess ? (
            <Button title="Selesai" onPress={() => router.back()} />
          ) : (
            <Button title="Simpan PIN" loading={change.isPending} disabled={!valid} onPress={() => change.mutate({ oldPin: hasPin ? oldPin : undefined, newPin: pin })} />
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
