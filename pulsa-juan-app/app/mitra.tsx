import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { formatRp, isValidNik } from 'pulsa-juan-common';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Share, Text, View } from 'react-native';

import { API_BASE } from '../src/api/client';
import { useHome, useMe, useMitra, useUpdateProfile } from '../src/api/hooks';
import { OtpStep } from '../src/auth/OtpStep';
import { Button, Card, ErrorView, Field, KeyValue, Loading, Screen, SectionTitle } from '../src/components/ui';
import { colors, font } from '../src/theme';
import { fmtDate } from './(tabs)/transaksi';

export default function MitraScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const me = useMe();
  const home = useHome();
  const mitra = useMitra();
  const update = useUpdateProfile();
  const [form, setForm] = useState({ name: '', nik: '', referralMarkup: '' });
  const [changingPhone, setChangingPhone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (me.data) setForm({ name: me.data.name, nik: me.data.nik ?? '', referralMarkup: String(me.data.referralMarkup) });
  }, [me.data]);

  if (me.isLoading || mitra.isLoading) return <Screen title="Mitra"><Loading /></Screen>;
  if (me.isError || mitra.isError) return <Screen title="Mitra"><ErrorView message={((me.error ?? mitra.error) as Error).message} /></Screen>;
  const a = me.data!;
  const m = mitra.data!;
  const cap = home.data?.config.maxReferralMarkup ?? 2000;
  const shareText = `Gabung jadi agen Pulsa Juan pakai kode referral saya: ${a.commisionUniqueId}`;
  const share = async () => {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'share' in navigator) await navigator.share({ text: shareText });
      else await Clipboard.setStringAsync(shareText);
    } else await Share.share({ message: shareText });
  };
  const nikError = form.nik && !isValidNik(form.nik) ? 'NIK harus 16 angka' : null;
  const save = () =>
    update.mutate(
      { name: form.name, nik: form.nik && form.nik !== a.nik ? form.nik : undefined, referralMarkup: Number(form.referralMarkup) || 0 },
      { onSuccess: () => setMsg('Tersimpan'), onError: (e) => setMsg((e as Error).message) },
    );
  const changePhone = (phoneOtpTicket: string) =>
    update.mutate(
      { phoneOtpTicket },
      { onSuccess: () => { setChangingPhone(false); setMsg('Nomor HP diperbarui'); }, onError: (e) => setMsg((e as Error).message) },
    );

  return (
    <Screen title="Mitra & Profil">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.muted, fontSize: font.small }}>Kode referral Anda</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary, letterSpacing: 2 }}>{a.commisionUniqueId}</Text>
          <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 4 }}>
            Setiap transaksi mitra yang mendaftar dengan kode ini memberi Anda komisi {formatRp(a.referralMarkup)}. Berlaku sampai 2 tingkat.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Button title="Bagikan" style={{ flex: 1 }} onPress={share} />
            <Button title="Salin" variant="outline" style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(a.commisionUniqueId)} />
          </View>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <SectionTitle>{edit ? 'Ubah profil' : 'Pengaturan'}</SectionTitle>
          <Field label="Nama" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Field label="NIK" value={form.nik} onChangeText={(v) => setForm({ ...form, nik: v.replace(/\D/g, '').slice(0, 16) })} keyboardType="number-pad" placeholder="16 angka sesuai KTP" error={nikError} />
          <Field
            label="Markup untuk mitra baru (Rp per transaksi)"
            value={form.referralMarkup}
            onChangeText={(v) => setForm({ ...form, referralMarkup: v.replace(/\D/g, '') })}
            keyboardType="number-pad"
            hint={`Maksimal ${formatRp(cap)}. Dikunci per mitra saat mereka mendaftar.`}
          />
          {msg ? <Text style={{ color: msg === 'Tersimpan' || msg === 'Nomor HP diperbarui' ? colors.primary : colors.danger, marginBottom: 8 }}>{msg}</Text> : null}
          <Button title="Simpan" loading={update.isPending} onPress={save} disabled={!!nikError} />
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <SectionTitle>Nomor HP</SectionTitle>
          {changingPhone ? (
            <>
              <OtpStep purpose="VERIFY_PHONE" phoneLabel="Nomor HP baru" onVerified={(r) => changePhone(r.otpTicket)} />
              <Button title="Batal" variant="ghost" style={{ marginTop: 8 }} onPress={() => setChangingPhone(false)} />
            </>
          ) : (
            <>
              <KeyValue label={a.phone} value={a.phoneVerified ? 'Terverifikasi' : 'Belum verifikasi'} />
              <Button title="Ganti nomor HP" variant="outline" style={{ marginTop: 8 }} onPress={() => { setMsg(null); setChangingPhone(true); }} />
            </>
          )}
        </Card>

        {m.parent ? (
          <Card style={{ marginBottom: 12 }}>
            <SectionTitle>Mitra pengundang</SectionTitle>
            <KeyValue label={m.parent.name} value={`+${formatRp(m.parent.commisionAmount)} / transaksi`} />
          </Card>
        ) : null}
        <Card>
          <SectionTitle>{`Mitra saya (${m.children.length})`}</SectionTitle>
          {m.children.length === 0 ? <Text style={{ color: colors.muted }}>Belum ada mitra. Bagikan kode referral Anda.</Text> : null}
          {m.children.map((c) => (
            <KeyValue key={c.id} label={`${c.name} · ${fmtDate(c.joinedAt).slice(0, 10)}`} value={formatRp(c.commisionAmount) + ' / trx'} />
          ))}
        </Card>
        <Text style={{ color: colors.muted, fontSize: 10, marginTop: 16 }}>API: {API_BASE}</Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}
