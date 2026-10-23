import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { post } from '../api/client';
import { OtpPurpose, OtpRequestResult, OtpVerifyResult } from '../api/types';
import { Button, CodeInput, Field } from '../components/ui';
import { colors, font } from '../theme';

/**
 * Phone → OTP request → 6-digit code → otpTicket. Used by register (REGISTER),
 * forgot PIN (RESET_PIN) and change phone (VERIFY_PHONE).
 */
export function OtpStep({
  purpose,
  initialPhone = '',
  phoneLabel = 'Nomor HP',
  onVerified,
}: {
  purpose: OtpPurpose;
  initialPhone?: string;
  phoneLabel?: string;
  onVerified: (r: OtpVerifyResult) => void;
}) {
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await post<OtpRequestResult>('/agent/auth/otp/request', { phone, purpose });
      setPhone(r.phone);
      setPhase('code');
      setCode('');
      setResendIn(r.resendAfter);
      setDebugCode(r.debugCode ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      onVerified(await post<OtpVerifyResult>('/agent/auth/otp/verify', { phone, purpose, code: value }));
    } catch (e) {
      setError((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'phone') {
    return (
      <View>
        <Field label={phoneLabel} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" autoFocus testID="otp-phone" />
        <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 12 }}>Kami kirim kode verifikasi 6 angka ke nomor ini.</Text>
        {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}
        <Button title="Kirim Kode OTP" onPress={request} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} />
      </View>
    );
  }

  return (
    <View>
      <Text style={{ color: colors.ink2, fontSize: font.body, marginBottom: 12 }}>
        Masukkan kode yang dikirim ke <Text style={{ fontWeight: '700' }}>{phone}</Text>.{' '}
        <Text style={{ color: colors.teal, fontWeight: '700' }} onPress={() => setPhase('phone')}>
          Ganti nomor
        </Text>
      </Text>
      <CodeInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (v.length === 6) verify(v);
        }}
        autoFocus
        error={error}
        testID="otp-code"
      />
      {debugCode ? (
        <Text style={{ color: colors.warning, fontSize: font.small, marginBottom: 10 }}>Mode pengembangan: kode OTP {debugCode}</Text>
      ) : null}
      <Button title="Verifikasi" onPress={() => verify()} loading={busy} disabled={code.length !== 6} />
      <Pressable onPress={request} disabled={resendIn > 0 || busy} style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={{ color: resendIn > 0 ? colors.muted : colors.teal, fontWeight: '600', fontSize: font.body }}>
          {resendIn > 0 ? `Kirim ulang dalam ${resendIn} detik` : 'Kirim ulang kode'}
        </Text>
      </Pressable>
    </View>
  );
}
