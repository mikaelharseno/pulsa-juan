import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { colors, font } from '../theme';
import { Sheet } from './Sheet';
import { Button, CodeInput } from './ui';

/**
 * Asks for the 6-digit PIN before an order is sent. Submits as soon as six
 * digits are in; `error` (from the server) clears the boxes for another try.
 * An agent without a PIN is offered to make one first.
 */
export function PinSheet({
  visible,
  hasPin,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  hasPin: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (!visible || error) setPin('');
  }, [visible, error]);

  if (!hasPin) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Buat PIN dulu">
        <Text style={{ color: colors.muted, fontSize: font.body, marginBottom: 16 }}>
          Setiap transaksi dikonfirmasi dengan PIN 6 angka supaya saldo Anda aman. Buat PIN Anda, lalu kembali ke sini untuk membayar.
        </Text>
        <Button title="Buat PIN" onPress={() => { onClose(); router.push('/pin'); }} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Masukkan PIN">
      <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 12 }}>Konfirmasi transaksi dengan PIN 6 angka Anda.</Text>
      <CodeInput
        value={pin}
        secure
        autoFocus
        error={error}
        testID="purchase-pin"
        onChange={(v) => {
          setPin(v);
          if (v.length === 6 && !busy) onSubmit(v);
        }}
      />
      <Button title="Bayar" loading={busy} disabled={pin.length !== 6} onPress={() => onSubmit(pin)} />
    </Sheet>
  );
}
