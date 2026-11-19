import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { detectProvider, isValidIndoMobile, normalizeIndonesianMobile, PROVIDER_LABELS } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { useAgentConfig, useHome } from '../../src/api/hooks';
import { Button, Field, Screen } from '../../src/components/ui';
import { colors, font } from '../../src/theme';

/**
 * "Pulsa" tile: type (or pick) the number, then continue in that operator's
 * own tile (slug paket-<operator>) with the number already filled in.
 */
export default function PulsaRouterScreen() {
  const { segmentId } = useLocalSearchParams<{ segmentId: string }>();
  const router = useRouter();
  const home = useHome();
  const config = useAgentConfig();
  const [raw, setRaw] = useState('');
  const normalized = normalizeIndonesianMobile(raw);
  const provider = detectProvider(normalized, config.data?.prefixes ?? []);
  const segments = home.data?.segments ?? [];
  const self = segments.find((s) => s.id === segmentId);
  const target = provider ? segments.find((s) => s.slug === `paket-${provider.toLowerCase()}`) : undefined;
  const valid = isValidIndoMobile(normalized);
  const error = !raw ? null : !valid ? (normalized.length >= 10 ? 'Nomor HP tidak valid' : null) : !provider ? 'Operator tidak dikenali' : !target ? `Produk ${PROVIDER_LABELS[provider]} belum tersedia` : null;

  const pickContact = async () => {
    try {
      const c = await Contacts.presentContactPickerAsync();
      const num = c?.phoneNumbers?.find((p) => p.number)?.number;
      if (num) setRaw(normalizeIndonesianMobile(num));
    } catch {
      Alert.alert('Kontak', 'Tidak bisa membuka daftar kontak');
    }
  };

  return (
    <Screen title={self?.label ?? 'Pulsa'}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.muted, fontSize: font.body, marginBottom: 12 }}>Masukkan nomor HP tujuan; paket operatornya langsung ditampilkan.</Text>
        <Field
          label="Nomor HP"
          value={raw}
          onChangeText={setRaw}
          keyboardType="phone-pad"
          placeholder="08xxxxxxxxxx"
          autoFocus
          error={error}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {provider ? (
                <View style={{ backgroundColor: colors.primaryRing, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                  <Text style={{ color: colors.primaryDark, fontWeight: '700', fontSize: font.small }}>{PROVIDER_LABELS[provider]}</Text>
                </View>
              ) : null}
              <Pressable onPress={pickContact} hitSlop={10} accessibilityLabel="Pilih dari kontak">
                <Ionicons name="person-circle-outline" size={28} color={colors.tealDark} />
              </Pressable>
            </View>
          }
        />
        <Button
          title={target ? `Lanjut ke ${target.label}` : 'Lanjut'}
          disabled={!valid || !target}
          onPress={() => router.replace({ pathname: '/segment/[segmentId]', params: { segmentId: target!.id, phone: normalized } })}
        />
      </ScrollView>
    </Screen>
  );
}
