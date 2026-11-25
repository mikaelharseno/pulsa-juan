import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font } from '../theme';

// The QRIS on the top-up payment screen, with a magnifier (full-screen view)
// and "Simpan ke galeri" so an agent can scan it from another phone or open it
// in an e-wallet's "scan from gallery".

async function saveToGallery(url: string, label: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
    return 'Gambar dibuka di tab baru';
  }
  const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!perm.granted) throw new Error('Izin galeri ditolak. Izinkan di pengaturan HP untuk menyimpan QRIS.');
  const ext = /\.png(\?|$)/i.test(url) ? 'png' : 'jpg';
  const safe = label.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'qris';
  const target = `${FileSystem.cacheDirectory}qris-${safe}-${Date.now()}.${ext}`;
  const file = await FileSystem.downloadAsync(url, target);
  if (file.status !== 200) throw new Error('Gambar QRIS gagal diunduh');
  await MediaLibrary.saveToLibraryAsync(file.uri);
  return 'QRIS tersimpan di galeri';
}

export function QrisImage({ url, label }: { url: string; label: string }) {
  const [zoom, setZoom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const save = async () => {
    setNote(null);
    setSaving(true);
    try {
      setNote({ ok: true, text: await saveToGallery(url, label) });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message || 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  const actions = (inViewer: boolean) => (
    <View style={styles.actions}>
      {inViewer ? null : (
        <Pressable onPress={() => setZoom(true)} style={styles.action} accessibilityRole="button" testID="qris-zoom">
          <Ionicons name="search" size={16} color={colors.tealDark} />
          <Text style={styles.actionText}>Perbesar</Text>
        </Pressable>
      )}
      <Pressable onPress={save} disabled={saving} style={styles.action} accessibilityRole="button" testID="qris-save">
        {saving ? <ActivityIndicator size="small" color={colors.tealDark} /> : <Ionicons name="download-outline" size={16} color={colors.tealDark} />}
        <Text style={styles.actionText}>Simpan ke galeri</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ alignItems: 'center', marginTop: 12 }}>
      <Pressable onPress={() => setZoom(true)} accessibilityLabel={`Perbesar QRIS ${label}`}>
        <Image source={{ uri: url }} style={styles.thumb} contentFit="contain" accessibilityLabel={`QRIS ${label}`} />
      </Pressable>
      <Text style={{ color: colors.ink, fontSize: font.small, fontWeight: '600', marginTop: 6 }}>{label}</Text>
      {actions(false)}
      {note ? <Text style={{ color: note.ok ? colors.tealDark : colors.danger, fontSize: font.small, marginTop: 6 }}>{note.text}</Text> : null}

      <Modal visible={zoom} animationType="fade" onRequestClose={() => setZoom(false)}>
        <View style={[styles.full, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.fullHeader}>
            <Text style={styles.fullTitle} numberOfLines={1}>{label}</Text>
            <Pressable onPress={() => setZoom(false)} hitSlop={12} accessibilityLabel="Tutup" testID="qris-close">
              <Ionicons name="close" size={28} color={colors.ink} />
            </Pressable>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: url }} style={{ width: width - 32, height: width - 32 }} contentFit="contain" />
          </View>
          {actions(true)}
          {note ? <Text style={{ color: note.ok ? colors.tealDark : colors.danger, fontSize: font.small, marginTop: 6, textAlign: 'center' }}>{note.text}</Text> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 260, height: 260, borderRadius: 8, backgroundColor: colors.white },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.card },
  actionText: { color: colors.tealDark, fontSize: font.small, fontWeight: '600' },
  full: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 16 },
  fullHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fullTitle: { flex: 1, fontSize: font.title, fontWeight: '700', color: colors.ink },
});
