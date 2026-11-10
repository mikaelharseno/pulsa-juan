import * as Brightness from 'expo-brightness';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useCheckLiveness, useStartLiveness, useSubmitKyc } from '../../src/api/hooks';
import { Button, Card, Screen } from '../../src/components/ui';
import { useKycDraft } from '../../src/kyc/useKycDraft';
import { colors, font } from '../../src/theme';

// Step 2 + 3: the live check, then the selfie. The server picks the colour
// order; we fill the whole screen white, then with each colour, and shoot a
// small front-camera frame each time. The server checks the face picked up
// each colour. Only after it passes does the selfie button unlock.

const SCREEN_COLOR: Record<'white' | 'red' | 'blue' | 'yellow', string> = {
  white: '#FFFFFF',
  red: '#FF0000',
  blue: '#0000FF',
  yellow: '#FFFF00',
};

type Phase = 'intro' | 'flashing' | 'checking' | 'passed' | 'review' | 'sending';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Faces ML Kit finds in a frame; null when face detection is not available. */
async function countFaces(uri: string): Promise<number | null> {
  try {
    const { default: FaceDetection } = await import('@react-native-ml-kit/face-detection');
    return (await FaceDetection.detect(uri, { performanceMode: 'fast' })).length;
  } catch {
    return null;
  }
}

export default function WajahScreen() {
  const router = useRouter();
  const camera = useRef<CameraView>(null);
  const [perm, requestPerm] = useCameraPermissions();
  const draft = useKycDraft();
  const start = useStartLiveness();
  const check = useCheckLiveness();
  const submit = useSubmitKyc();
  const [phase, setPhase] = useState<Phase>('intro');
  const [flash, setFlash] = useState<keyof typeof SCREEN_COLOR | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [livenessId, setLivenessId] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const savedBrightness = useRef<number | null>(null);

  // put the screen brightness back however the screen is left
  useEffect(
    () => () => {
      if (savedBrightness.current != null) Brightness.setBrightnessAsync(savedBrightness.current).catch(() => undefined);
    },
    [],
  );

  const shootFrame = async () => {
    const pic = await camera.current?.takePictureAsync({ quality: 0.5, skipProcessing: true, shutterSound: false });
    if (!pic) throw new Error('Kamera tidak merespons');
    const small = await ImageManipulator.manipulateAsync(pic.uri, [{ resize: { width: 360 } }], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG });
    return small.uri;
  };

  const runCheck = async () => {
    setError(null);
    try {
      if (!draft.ktpUri) throw new Error('Foto KTP belum ada. Ulangi dari awal.');
      try {
        savedBrightness.current = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
      } catch {
        // some phones refuse; the check still runs
      }
      const challenge = await start.mutateAsync();
      setPhase('flashing');
      const order: (keyof typeof SCREEN_COLOR)[] = ['white', ...challenge.colors];
      const uris: string[] = [];
      for (const color of order) {
        setFlash(color);
        await wait(challenge.flashMs);
        uris.push(await shootFrame());
      }
      setFlash(null);
      setPhase('checking');
      const faces = await Promise.all(uris.map(countFaces));
      if (faces.every((f) => f !== null) && faces.filter((f) => (f ?? 0) >= 1).length < uris.length - 1) {
        throw new Error('Wajah tidak terlihat jelas. Pegang HP sejajar wajah dan jangan bergerak selama layar berkedip.');
      }
      const res = await check.mutateAsync({ id: challenge.id, frames: uris.map((uri, i) => ({ uri, name: `frame${i}.jpg`, type: 'image/jpeg' })) });
      if (!res.passed) throw new Error(res.reason ?? 'Cek wajah belum lolos. Ulangi.');
      setLivenessId(challenge.id);
      setPhase('passed');
    } catch (e) {
      setFlash(null);
      setPhase('intro');
      setError((e as Error).message);
    } finally {
      if (savedBrightness.current != null) {
        Brightness.setBrightnessAsync(savedBrightness.current).catch(() => undefined);
        savedBrightness.current = null;
      }
    }
  };

  const takeSelfie = async () => {
    setError(null);
    try {
      const pic = await camera.current?.takePictureAsync({ quality: 0.85, shutterSound: false });
      if (!pic) throw new Error('Foto gagal diambil');
      setSelfieUri(pic.uri);
      setPhase('review');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const send = async () => {
    if (!livenessId || !selfieUri || !draft.ktpUri) return;
    setError(null);
    setPhase('sending');
    try {
      await submit.mutateAsync({
        livenessId,
        nik: draft.nik,
        name: draft.name.trim(),
        ocrNik: draft.ocrNik ?? undefined,
        ocrName: draft.ocrName ?? undefined,
        ocrText: draft.ocrText || undefined,
        ktp: { uri: draft.ktpUri, name: 'ktp.jpg', type: 'image/jpeg' },
        selfie: { uri: selfieUri, name: 'selfie.jpg', type: 'image/jpeg' },
      });
      draft.reset();
      router.replace('/verifikasi');
    } catch (e) {
      setPhase('review');
      setError((e as Error).message);
    }
  };

  if (!perm) return <Screen title="Cek Wajah"><ActivityIndicator /></Screen>;
  if (!perm.granted) {
    return (
      <Screen title="Cek Wajah">
        <Card>
          <Text style={{ color: colors.ink2, fontSize: font.body, marginBottom: 12 }}>Izinkan kamera depan untuk cek wajah dan selfie.</Text>
          <Button title="Izinkan kamera" onPress={requestPerm} />
        </Card>
      </Screen>
    );
  }

  if (phase === 'review' || phase === 'sending') {
    return (
      <Screen title="Kirim Verifikasi">
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <Image source={{ uri: draft.ktpUri ?? undefined }} style={styles.thumb} contentFit="cover" />
            <Image source={{ uri: selfieUri ?? undefined }} style={styles.thumb} contentFit="cover" />
          </View>
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.muted, fontSize: font.small }}>NIK</Text>
            <Text style={{ color: colors.ink, fontSize: font.body, fontWeight: '700', marginBottom: 6 }}>{draft.nik}</Text>
            <Text style={{ color: colors.muted, fontSize: font.small }}>Nama</Text>
            <Text style={{ color: colors.ink, fontSize: font.body, fontWeight: '700' }}>{draft.name}</Text>
          </Card>
          {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Selfie ulang" variant="outline" style={{ flex: 1 }} disabled={phase === 'sending'} onPress={() => { setSelfieUri(null); setPhase('passed'); }} />
            <Button title="Kirim" style={{ flex: 1 }} loading={phase === 'sending'} onPress={send} />
          </View>
        </View>
      </Screen>
    );
  }

  const busy = phase === 'flashing' || phase === 'checking' || start.isPending;
  return (
    <Screen title="Cek Wajah" padded={false}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" />
        {flash ? <View style={[StyleSheet.absoluteFill, { backgroundColor: SCREEN_COLOR[flash] }]} pointerEvents="none" /> : null}
        {!flash ? (
          <View style={styles.overlay} pointerEvents="none">
            <View style={[styles.oval, phase === 'passed' && { borderColor: colors.accent }]} />
            <Text style={styles.hint}>
              {phase === 'passed'
                ? 'Cek wajah lolos. Posisikan wajah di dalam bingkai lalu ambil selfie.'
                : phase === 'checking'
                  ? 'Memeriksa...'
                  : 'Dekatkan wajah ke layar (sekitar 20–30 cm). Layar akan berkedip putih, merah, biru dan kuning. Jangan bergerak.'}
            </Text>
          </View>
        ) : null}
        {!flash ? (
          <View style={styles.bottom}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {phase === 'passed' ? (
              <Button title="Ambil selfie" onPress={takeSelfie} />
            ) : (
              <Button title={phase === 'checking' ? 'Memeriksa...' : error ? 'Ulangi cek wajah' : 'Mulai cek wajah'} loading={busy} onPress={runCheck} />
            )}
            {phase !== 'passed' ? <Text style={styles.small}>Tombol selfie terbuka setelah cek wajah lolos.</Text> : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  oval: { width: 230, height: 300, borderRadius: 150, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  hint: { color: '#fff', fontSize: font.small, textAlign: 'center', marginTop: 16, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 28 },
  error: { color: '#FCA5A5', marginBottom: 8, textAlign: 'center', fontSize: font.small },
  small: { color: 'rgba(255,255,255,0.7)', fontSize: font.tiny, textAlign: 'center', marginTop: 8 },
  thumb: { flex: 1, aspectRatio: 0.8, borderRadius: 10, backgroundColor: colors.field },
});
