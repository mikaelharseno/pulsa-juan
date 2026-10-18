import { Link, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { post } from '../../src/api/client';
import { Session } from '../../src/api/types';
import { GoogleButton } from '../../src/auth/GoogleButton';
import { useAuth } from '../../src/auth/useAuth';
import { Button, Card, Field } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

export default function RegisterScreen() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const signIn = useAuth((s) => s.signIn);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', referralCode: (ref ?? '').toUpperCase() });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.length >= 2 && form.email.includes('@') && form.phone.length >= 10 && form.password.length >= 6;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(await post<Session>('/agent/auth/register', { ...form, referralCode: form.referralCode || undefined }));
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
            <Text style={{ color: colors.white, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>Daftar Agen</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: font.body, marginTop: 4, textAlign: 'center' }}>Gratis, langsung aktif. Isi saldo lalu mulai jualan.</Text>
          </View>
          <Card style={{ padding: 20, borderRadius: 20, borderWidth: 0 }}>
            <Field label="Nama" value={form.name} onChangeText={set('name')} placeholder="Nama lengkap" />
            <Field label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com" />
            <Field label="Nomor HP" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" />
            <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="minimal 6 karakter" />
            <Field label="Kode referral (opsional)" value={form.referralCode} onChangeText={(v) => set('referralCode')(v.toUpperCase())} autoCapitalize="characters" placeholder="Kode dari mitra pengundang" />
            {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
            <Button title="Daftar" onPress={submit} loading={busy} disabled={!valid} />
            <View style={{ height: 12 }} />
            <GoogleButton referralCode={form.referralCode} onError={setError} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
              <Text style={{ color: colors.muted, fontSize: font.body }}>Sudah punya akun? </Text>
              <Link href="/(auth)/login" style={{ color: colors.teal, fontWeight: '700' }}>
                Masuk
              </Link>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </LinearGradient>
  );
}
