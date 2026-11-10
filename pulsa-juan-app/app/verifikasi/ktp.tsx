import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { isPlausibleNik, parseKtpText } from 'pulsa-juan-common';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, Screen } from '../../src/components/ui';
import { choosePictureSize } from '../../src/kyc/pictureSize';
import { useKycDraft } from '../../src/kyc/useKycDraft';
import { colors, font } from '../../src/theme';

/** Reads the KTP photo on the phone (ML Kit). Never throws: unread fields stay empty. */
async function readKtp(uri: string) {
  try {
    const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
    const res = await TextRecognition.recognize(uri);
    return { text: res.text ?? '', ...parseKtpText(res.text ?? '') };
  } catch {
    return { text: '', nik: null, name: null };
  }
}

/** Step 1: photo of the KTP, NIK + name read off it, confirmed by the agent. */
export default function KtpScreen() {
  const router = useRouter();
  const camera = useRef<CameraView>(null);
  const [perm, requestPerm] = useCameraPermissions();
  const draft = useKycDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  const shoot = async () => {
    setError(null);
    setBusy(true);
    try {
      const pic = await camera.current?.takePictureAsync({ quality: 0.85, shutterSound: false });
      if (!pic) throw new Error('Foto gagal diambil');
      const read = await readKtp(pic.uri);
      draft.setKtp({ uri: pic.uri, ...read });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!perm) return <Screen title="Foto KTP"><ActivityIndicator /></Screen>;
  if (!perm.granted) {
    return (
      <Screen title="Foto KTP">
        <Card>
          <Text style={{ color: colors.ink2, fontSize: font.body, marginBottom: 12 }}>Izinkan kamera untuk memotret KTP Anda.</Text>
          <Button title="Izinkan kamera" onPress={requestPerm} />
        </Card>
      </Screen>
    );
  }

  if (draft.ktpUri) {
    const nikOk = isPlausibleNik(draft.nik);
    const nameOk = draft.name.trim().length >= 2;
    const nothingRead = !draft.ocrNik && !draft.ocrName;
    return (
      <Screen title="Periksa data KTP">
        <ScrollView keyboardShouldPersistTaps="handled">
          <Image source={{ uri: draft.ktpUri }} style={{ width: '100%', aspectRatio: 1.58, borderRadius: 10, marginBottom: 12, backgroundColor: colors.field }} contentFit="cover" />
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ color: nothingRead ? colors.warning : colors.muted, fontSize: font.small, marginBottom: 10 }}>
              {nothingRead ? 'Tulisan di KTP belum terbaca. Ketik NIK dan nama sesuai KTP, atau foto ulang di tempat yang lebih terang.' : 'Dibaca otomatis dari foto. Periksa dan perbaiki bila ada yang salah.'}
            </Text>
            <Field
              label="NIK"
              value={draft.nik}
              onChangeText={(v) => draft.setConfirmed({ nik: v.replace(/\D/g, '').slice(0, 16), name: draft.name })}
              keyboardType="number-pad"
              placeholder="16 angka"
              error={draft.nik.length === 16 && !nikOk ? 'NIK tidak sesuai format KTP' : null}
              testID="kyc-nik"
            />
            <Field label="Nama sesuai KTP" value={draft.name} onChangeText={(v) => draft.setConfirmed({ nik: draft.nik, name: v.toUpperCase() })} autoCapitalize="characters" testID="kyc-name" />
          </Card>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Foto ulang" variant="outline" style={{ flex: 1 }} onPress={() => draft.reset()} />
            <Button title="Lanjut" style={{ flex: 1 }} disabled={!nikOk || !nameOk} onPress={() => router.push('/verifikasi/wajah')} />
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen title="Foto KTP" padded={false}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="on"
          pictureSize={pictureSize}
          onCameraReady={async () => {
            if (!pictureSize) setPictureSize(await choosePictureSize(camera.current, 1920));
            setReady(true);
          }}
        />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.cardFrame} />
          <Text style={styles.hint}>Letakkan KTP di dalam bingkai, pastikan tulisan terbaca dan tidak silau.</Text>
        </View>
        <View style={styles.bottom}>
          {error ? <Text style={{ color: '#FCA5A5', marginBottom: 8, textAlign: 'center' }}>{error}</Text> : null}
          <Button title={busy ? 'Membaca KTP...' : 'Ambil foto KTP'} loading={busy} disabled={!ready} onPress={shoot} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  cardFrame: { width: '100%', aspectRatio: 1.58, borderRadius: 14, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  hint: { color: '#fff', fontSize: font.small, textAlign: 'center', marginTop: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 28 },
});
