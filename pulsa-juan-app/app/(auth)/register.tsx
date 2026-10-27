import { Link, useLocalSearchParams } from 'expo-router';
import { isValidIndoMobile, isValidNik, isValidPin, normalizeIndonesianMobile } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { post } from '../../src/api/client';
import { Session } from '../../src/api/types';
import { AuthShell, OrDivider } from '../../src/auth/AuthShell';
import { GOOGLE_CONFIGURED, GoogleButton } from '../../src/auth/GoogleButton';
import { useAuth } from '../../src/auth/useAuth';
import { Button, CodeInput, Field } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

/**
 * Phone + profile + PIN in one form, no OTP (no SMS/WhatsApp cost; the phone is
 * stored unverified). Google sits on top; a Google sign-up arrives with
 * pendingGoogle set and fills the same form minus email.
 */
export default function RegisterScreen() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const signIn = useAuth((s) => s.signIn);
  const pendingGoogle = useAuth((s) => s.pendingGoogle);
  const setPendingGoogle = useAuth((s) => s.setPendingGoogle);
  const [form, setForm] = useState({
    phone: '',
    name: pendingGoogle?.name ?? '',
    nik: '',
    email: '',
    password: '',
    referralCode: (ref ?? '').toUpperCase(),
  });
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const phoneValid = isValidIndoMobile(normalizeIndonesianMobile(form.phone));
  const phoneError = form.phone.length >= 10 && !phoneValid ? 'Nomor HP tidak valid' : null;
  const nikError = form.nik && !isValidNik(form.nik) ? 'NIK harus 16 angka' : null;
  const pinError = pin.length === 6 && !isValidPin(pin) ? 'PIN tidak boleh sama semua / berurutan' : null;
  const pin2Error = pin2.length === 6 && pin2 !== pin ? 'PIN tidak sama' : null;
  const passwordError = form.password && form.password.length < 6 ? 'Minimal 6 karakter' : null;
  const valid = phoneValid && form.name.trim().length >= 2 && !nikError && !passwordError && isValidPin(pin) && pin === pin2;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await post<Session>('/agent/auth/register', {
        phone: form.phone,
        googleTicket: pendingGoogle?.googleTicket,
        name: form.name.trim(),
        pin,
        nik: form.nik || undefined,
        email: pendingGoogle ? undefined : form.email.trim() || undefined,
        password: form.password || undefined,
        referralCode: form.referralCode || undefined,
      });
      setPendingGoogle(null);
      await signIn(session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Daftar Agen" subtitle="Gratis, langsung aktif. Isi saldo lalu mulai jualan.">
      {pendingGoogle ? (
        <View style={{ backgroundColor: colors.tealTint, borderRadius: 10, padding: 10, marginBottom: 14 }}>
          <Text style={{ color: colors.ink2, fontSize: font.small }}>
            Akun Google {pendingGoogle.email} akan dihubungkan. Lengkapi data untuk melanjutkan.{' '}
            <Text style={{ color: colors.teal, fontWeight: '700' }} onPress={() => setPendingGoogle(null)}>Batal</Text>
          </Text>
        </View>
      ) : GOOGLE_CONFIGURED ? (
        <>
          <GoogleButton label="DAFTAR DENGAN GOOGLE" onError={setError} onNeedsPhone={() => setError(null)} />
          <OrDivider label="atau daftar dengan nomor HP" />
        </>
      ) : null}
      <Field label="Nomor HP" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" error={phoneError} testID="reg-phone" />
      <Field label="Nama" value={form.name} onChangeText={set('name')} placeholder="Nama lengkap" testID="reg-name" />
      <Field label="NIK (opsional)" value={form.nik} onChangeText={(v) => set('nik')(v.replace(/\D/g, '').slice(0, 16))} keyboardType="number-pad" placeholder="16 angka sesuai KTP" error={nikError} testID="reg-nik" />
      {!pendingGoogle ? (
        <Field label="Email (opsional)" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com" />
      ) : null}
      <Field label="Password (opsional)" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="untuk masuk dengan nomor HP / email" error={passwordError} />
      <Field label="Kode referral (opsional)" value={form.referralCode} onChangeText={(v) => set('referralCode')(v.toUpperCase())} autoCapitalize="characters" placeholder="Kode dari mitra pengundang" />
      <CodeInput label="Buat PIN (6 angka)" secure value={pin} onChange={setPin} error={pinError} testID="reg-pin" />
      <CodeInput label="Ulangi PIN" secure value={pin2} onChange={setPin2} error={pin2Error} testID="reg-pin2" />
      {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
      <Button title="Daftar" onPress={submit} loading={busy} disabled={!valid} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
        <Text style={{ color: colors.muted, fontSize: font.body }}>Sudah punya akun? </Text>
        <Link href="/(auth)/login" style={{ color: colors.teal, fontWeight: '700' }}>
          Masuk
        </Link>
      </View>
    </AuthShell>
  );
}
