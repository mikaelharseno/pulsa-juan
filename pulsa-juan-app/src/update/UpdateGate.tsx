import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Modal, StyleSheet, Text, View } from 'react-native';

import { APP_VERSION, get, IS_MOCK, setUpdateRequiredHandler } from '../api/client';
import { AgentConfig } from '../api/types';
import { Button } from '../components/ui';
import { colors, font } from '../theme';

// Forced update (meeting 19 Nov 2026): the dashboard sets the oldest allowed
// app version. When this app is older, a dialog that cannot be closed asks the
// agent to install the new version. Checked on start, whenever the app comes
// back to the foreground, and whenever the server answers 426.

const VERSION_RE = /^\d+\.\d+\.\d+$/;

export function isOlder(version: string, min: string) {
  if (!VERSION_RE.test(version) || !VERSION_RE.test(min)) return false;
  const a = version.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

export function UpdateGate() {
  const [required, setRequired] = useState<{ min: string; url: string } | null>(null);

  const check = useCallback(async () => {
    if (IS_MOCK) return;
    try {
      const c = await get<AgentConfig>('/agent/config');
      if (c.minAppVersion && isOlder(APP_VERSION, c.minAppVersion)) setRequired({ min: c.minAppVersion, url: c.appDownloadUrl ?? '' });
      else setRequired(null);
    } catch {
      // offline: the next request or foreground check tries again
    }
  }, []);

  useEffect(() => {
    check();
    setUpdateRequiredHandler((info) => setRequired(info));
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => {
      setUpdateRequiredHandler(null);
      sub.remove();
    };
  }, [check]);

  return (
    <Modal visible={!!required} transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="update-required">
          <View style={styles.icon}>
            <Ionicons name="cloud-download-outline" size={30} color={colors.teal} />
          </View>
          <Text style={styles.title}>Perbarui aplikasi</Text>
          <Text style={styles.body}>
            Versi aplikasi Anda ({APP_VERSION}) sudah tidak didukung. Silakan update ke versi {required?.min ?? ''} atau yang lebih baru untuk lanjut memakai Murah Kuota.
          </Text>
          <Button title="Update sekarang" icon="download-outline" disabled={!required?.url} onPress={() => required?.url && Linking.openURL(required.url)} />
          <Text style={styles.small}>Setelah memasang versi baru, buka lagi aplikasinya.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.card, borderRadius: 18, padding: 22 },
  icon: { alignSelf: 'center', width: 60, height: 60, borderRadius: 30, backgroundColor: colors.tealTint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: font.title, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: font.body, color: colors.ink2, textAlign: 'center', marginBottom: 18, lineHeight: 20 },
  small: { fontSize: font.small, color: colors.muted, textAlign: 'center', marginTop: 10 },
});
