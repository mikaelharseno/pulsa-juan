import { Link } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { IS_MOCK, post } from '../../src/api/client';
import { Session } from '../../src/api/types';
import { GoogleButton } from '../../src/auth/GoogleButton';
import { useAuth } from '../../src/auth/useAuth';
import { Button, Card, Field } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

export default function LoginScreen() {
  const signIn = useAuth((s) => s.signIn);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(await post<Session>('/agent/auth/login', { identifier, password }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[colors.teal, colors.tealDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 22 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Text style={{ color: colors.white, fontSize: 26, fontWeight: '800' }}>PJ</Text>
            </View>
            <Text style={{ color: colors.white, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>Pulsa Juan</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: font.body, marginTop: 4 }}>Aplikasi mitra agen pulsa & pembayaran</Text>
          </View>
          <Card style={{ padding: 20, borderRadius: 20, borderWidth: 0 }}>
            <Field label="Email atau nomor HP" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com / 08xx" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" />
 {IS_MOCK ? <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 12 }}>Mode demo: isi email dan password apa saja untuk masuk.</Text> : null}
            {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
            <Button title="Masuk" onPress={submit} loading={busy} disabled={!identifier || !password} />
            <View style={{ height: 12 }} />
            <GoogleButton onError={setError} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
              <Text style={{ color: colors.muted }}>Belum punya akun? </Text>
              <Link href="/(auth)/register" style={{ color: colors.teal, fontWeight: '700' }}>
                Daftar
              </Link>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </LinearGradient>
  );
}
