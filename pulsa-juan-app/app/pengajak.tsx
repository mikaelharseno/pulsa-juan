import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { ReferrerForm } from '../src/components/ReferrerForm';
import { Button, Card, Screen } from '../src/components/ui';
import { colors, font } from '../src/theme';

/** Shown once right after sign-up without an inviter code. */
export default function PengajakScreen() {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  const finish = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  return (
    <Screen title="Siapa yang mengajak kamu?">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.ink2, fontSize: font.body, marginBottom: 12 }}>
            Kalau kamu daftar karena diajak agen lain, masukkan kode referral mereka. Mereka jadi mitra pengajak kamu. Bisa juga diisi nanti dari menu Mitra.
          </Text>
          {done ? (
            <>
              <Text style={{ color: colors.tealDark, fontSize: font.body, fontWeight: '600', marginBottom: 12 }}>Tersimpan. Pengajak kamu: {done}.</Text>
              <Button title="Lanjut" onPress={finish} />
            </>
          ) : (
            <ReferrerForm onDone={(name) => setDone(name)} />
          )}
        </Card>
        {!done ? <Button title="Lewati" variant="ghost" onPress={finish} /> : null}
      </ScrollView>
    </Screen>
  );
}
