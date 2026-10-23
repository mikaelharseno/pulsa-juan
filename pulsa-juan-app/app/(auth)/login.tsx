import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IS_MOCK, post } from '../../src/api/client';
import { Session } from '../../src/api/types';
import { AuthShell } from '../../src/auth/AuthShell';
import { GoogleButton } from '../../src/auth/GoogleButton';
import { useAuth } from '../../src/auth/useAuth';
import { Button, CodeInput, Field } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

export default function LoginScreen() {
  const signIn = useAuth((s) => s.signIn);
  const router = useRouter();
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<Session>) => {
    setBusy(true);
    setError(null);
    try {
      await signIn(await fn());
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };
  const loginPin = (value = pin) => run(() => post<Session>('/agent/auth/login/pin', { phone, pin: value }));
  const loginPassword = () => run(() => post<Session>('/agent/auth/login', { identifier, password }));

  return (
    <AuthShell logo title="Pulsa Juan" subtitle="Aplikasi mitra agen pulsa & pembayaran">
      {mode === 'pin' ? (
        <>
          <Field label="Nomor HP" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" testID="login-phone" />
          <CodeInput
            label="PIN"
            secure
            value={pin}
            onChange={(v) => {
              setPin(v);
              if (v.length === 6 && phone) loginPin(v);
            }}
            testID="login-pin"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -6, marginBottom: 12 }}>
            <Link href="/(auth)/forgot-pin" style={{ color: colors.teal, fontWeight: '600', fontSize: font.small }}>
              Lupa PIN?
            </Link>
          </View>
        </>
      ) : (
        <>
          <Field label="Email atau nomor HP" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com / 08xx" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" />
        </>
      )}
      {IS_MOCK ? <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 12 }}>Mode demo: isi nomor HP dan PIN apa saja untuk masuk.</Text> : null}
      {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
      {mode === 'pin' ? (
        <Button title="Masuk" onPress={() => loginPin()} loading={busy} disabled={!phone || pin.length !== 6} />
      ) : (
        <Button title="Masuk" onPress={loginPassword} loading={busy} disabled={!identifier || !password} />
      )}
      <Pressable onPress={() => { setMode(mode === 'pin' ? 'password' : 'pin'); setError(null); }} style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: colors.teal, fontWeight: '600', fontSize: font.body }}>{mode === 'pin' ? 'Masuk dengan email / password' : 'Masuk dengan nomor HP & PIN'}</Text>
      </Pressable>
      <View style={{ height: 12 }} />
      <GoogleButton onError={setError} onNeedsPhone={() => router.push('/(auth)/register')} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
        <Text style={{ color: colors.muted }}>Belum punya akun? </Text>
        <Link href="/(auth)/register" style={{ color: colors.teal, fontWeight: '700' }}>
          Daftar
        </Link>
      </View>
    </AuthShell>
  );
}
