import { Link, useLocalSearchParams } from 'expo-router';
import { isValidNik, isValidPin } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { post } from '../../src/api/client';
import { Session } from '../../src/api/types';
import { AuthShell } from '../../src/auth/AuthShell';
import { GoogleButton } from '../../src/auth/GoogleButton';
import { OtpStep } from '../../src/auth/OtpStep';
import { useAuth } from '../../src/auth/useAuth';
import { Button, CodeInput, Field } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

/** 1) phone + OTP → 2) profile + PIN. A Google sign-up arrives with pendingGoogle set. */
export default function RegisterScreen() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const signIn = useAuth((s) => s.signIn);
  const pendingGoogle = useAuth((s) => s.pendingGoogle);
  const setPendingGoogle = useAuth((s) => s.setPendingGoogle);
  const [ticket, setTicket] = useState<{ otpTicket: string; phone: string } | null>(null);
  const [form, setForm] = useState({
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

  const nikError = form.nik && !isValidNik(form.nik) ? 'NIK harus 16 angka' : null;
  const pinError = pin.length === 6 && !isValidPin(pin) ? 'PIN tidak boleh sama semua / berurutan' : null;
  const pin2Error = pin2.length === 6 && pin2 !== pin ? 'PIN tidak sama' : null;
  const passwordError = form.password && form.password.length < 6 ? 'Minimal 6 karakter' : null;
  const valid = form.name.trim().length >= 2 && !nikError && !passwordError && isValidPin(pin) && pin === pin2;

  const submit = async () => {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      const session = await post<Session>('/agent/auth/register', {
        otpTicket: ticket.otpTicket,
        googleTicket: pendingGoogle?.googleTicket,
        name: form.name.trim(),
        pin,
        nik: form.nik || undefined,
        email: pendingGoogle ? undefined : form.email.trim() || undefined,
        password: form.password || undefined,
        referralCode: form.referralCode || undefined,
      });
      await signIn(session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Daftar Agen" subtitle={ticket ? `Nomor ${ticket.phone} terverifikasi. Lengkapi data Anda.` : 'Gratis, langsung aktif. Isi saldo lalu mulai jualan.'}>
      {pendingGoogle ? (
        <View style={{ backgroundColor: colors.tealTint, borderRadius: 10, padding: 10, marginBottom: 14 }}>
          <Text style={{ color: colors.ink2, fontSize: font.small }}>
            Akun Google {pendingGoogle.email} akan dihubungkan. Verifikasi nomor HP untuk melanjutkan.{' '}
            <Text style={{ color: colors.teal, fontWeight: '700' }} onPress={() => setPendingGoogle(null)}>Batal</Text>
          </Text>
        </View>
      ) : null}
      {!ticket ? (
        <>
          <Text style={{ color: colors.muted, fontSize: font.tiny, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10 }}>LANGKAH 1 DARI 2 · VERIFIKASI NOMOR HP</Text>
          <OtpStep purpose="REGISTER" onVerified={(r) => setTicket({ otpTicket: r.otpTicket, phone: r.phone })} />
          {!pendingGoogle ? (
            <>
              <View style={{ height: 12 }} />
              <GoogleButton onError={setError} onNeedsPhone={() => setError(null)} />
            </>
          ) : null}
        </>
      ) : (
        <>
          <Text style={{ color: colors.muted, fontSize: font.tiny, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10 }}>LANGKAH 2 DARI 2 · DATA & PIN</Text>
          <Field label="Nama" value={form.name} onChangeText={set('name')} placeholder="Nama lengkap" testID="reg-name" />
          <Field label="NIK (opsional)" value={form.nik} onChangeText={(v) => set('nik')(v.replace(/\D/g, '').slice(0, 16))} keyboardType="number-pad" placeholder="16 angka sesuai KTP" error={nikError} testID="reg-nik" />
          {!pendingGoogle ? (
            <Field label="Email (opsional)" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" placeholder="nama@email.com" />
          ) : null}
          <Field label="Password (opsional)" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="untuk masuk dengan email" error={passwordError} />
          <Field label="Kode referral (opsional)" value={form.referralCode} onChangeText={(v) => set('referralCode')(v.toUpperCase())} autoCapitalize="characters" placeholder="Kode dari mitra pengundang" />
          <CodeInput label="Buat PIN (6 angka)" secure value={pin} onChange={setPin} error={pinError} testID="reg-pin" />
          <CodeInput label="Ulangi PIN" secure value={pin2} onChange={setPin2} error={pin2Error} testID="reg-pin2" />
          {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
          <Button title="Daftar" onPress={submit} loading={busy} disabled={!valid} />
        </>
      )}
      {!ticket && error ? <Text style={{ color: colors.danger, marginTop: 12 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
        <Text style={{ color: colors.muted, fontSize: font.body }}>Sudah punya akun? </Text>
        <Link href="/(auth)/login" style={{ color: colors.teal, fontWeight: '700' }}>
          Masuk
        </Link>
      </View>
    </AuthShell>
  );
}
