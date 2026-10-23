import { Link } from 'expo-router';
import { isValidPin } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { post } from '../../src/api/client';
import { Session } from '../../src/api/types';
import { AuthShell } from '../../src/auth/AuthShell';
import { OtpStep } from '../../src/auth/OtpStep';
import { useAuth } from '../../src/auth/useAuth';
import { Button, CodeInput } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

export default function ForgotPinScreen() {
  const signIn = useAuth((s) => s.signIn);
  const [otpTicket, setOtpTicket] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinError = pin.length === 6 && !isValidPin(pin) ? 'PIN tidak boleh sama semua / berurutan' : null;
  const pin2Error = pin2.length === 6 && pin2 !== pin ? 'PIN tidak sama' : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(await post<Session>('/agent/auth/pin/reset', { otpTicket, pin }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Lupa PIN" subtitle="Verifikasi nomor HP Anda lalu buat PIN baru.">
      {!otpTicket ? (
        <OtpStep purpose="RESET_PIN" phoneLabel="Nomor HP terdaftar" onVerified={(r) => setOtpTicket(r.otpTicket)} />
      ) : (
        <>
          <CodeInput label="PIN baru" secure value={pin} onChange={setPin} error={pinError} autoFocus />
          <CodeInput label="Ulangi PIN baru" secure value={pin2} onChange={setPin2} error={pin2Error} />
          {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
          <Button title="Simpan PIN & Masuk" onPress={submit} loading={busy} disabled={!isValidPin(pin) || pin !== pin2} />
        </>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
        <Link href="/(auth)/login" style={{ color: colors.teal, fontWeight: '700', fontSize: font.body }}>
          Kembali ke Masuk
        </Link>
      </View>
    </AuthShell>
  );
}
