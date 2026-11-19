import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  detectProvider,
  FlowStep,
  formatRp,
  isValidIndoMobile,
  normalizeIndonesianMobile,
  PhoneNumberInput,
  PROVIDER_LABELS,
  resolveNext,
  resolvePackageIds,
  validateStepInput,
} from 'pulsa-juan-common';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';

import { useAgentConfig, useTree } from '../../../src/api/hooks';
import { Chip, Empty, ErrorView, Field, ListRow, Loading, Screen } from '../../../src/components/ui';
import { compactChoices } from '../../../src/flow/compact';
import { useFlowStore } from '../../../src/flow/useFlowStore';
import { ServiceTile } from '../../../src/icons/ServiceIcon';
import { colors, font } from '../../../src/theme';

/**
 * One screen for "phone → package type → package" tiles: the number on top
 * (typed or picked from contacts), package types as chips, packages below.
 * Tapping a package commits all three steps and opens the confirmation.
 */
export default function QuickPickScreen() {
  const { segmentId, phone } = useLocalSearchParams<{ segmentId: string; phone?: string }>();
  const router = useRouter();
  const tree = useTree(segmentId);
  const config = useAgentConfig();
  const start = useFlowStore((s) => s.start);
  const clear = useFlowStore((s) => s.clear);
  const commit = useFlowStore((s) => s.commit);
  const [raw, setRaw] = useState(phone ?? '');
  const [chip, setChip] = useState<string | null>(null);

  useEffect(() => {
    if (tree.data) {
      clear(segmentId);
      start(segmentId, tree.data.treeVersion);
    }
  }, [tree.data, segmentId, start, clear]);

  const prefixes = config.data?.prefixes ?? [];
  const data = tree.data;
  const root = data?.tree.nodes[data.tree.rootId] as PhoneNumberInput | undefined;
  const normalized = normalizeIndonesianMobile(raw);
  const provider = detectProvider(normalized, prefixes);

  const state = useMemo(() => {
    if (!data || !root) return null;
    const ctx = { prefixes, packages: data.packages };
    const step = { nodeId: root.id, type: 'PhoneNumberInput' as const, phoneNumber: normalized };
    let error: string | null = null;
    let valid = false;
    let next = root.defaultChildId;
    if (raw && isValidIndoMobile(normalized)) {
      const err = validateStepInput(root, step, ctx, []);
      next = resolveNext(root, step, ctx);
      if (err) error = err.message;
      else if (!next) error = 'Operator nomor belum didukung';
      else valid = true;
    } else if (normalized.length >= 10) error = 'Nomor HP tidak valid';
    return { step, error, valid, choices: compactChoices(data.tree, next) };
  }, [data, root, raw, normalized, prefixes]);

  if (tree.isLoading) return <Screen title="Memuat..."><Loading /></Screen>;
  if (tree.isError || !data || !root || !state) return <Screen title="Layanan"><ErrorView message={tree.isError ? (tree.error as Error).message : 'Layanan tidak ditemukan'} onRetry={() => tree.refetch()} /></Screen>;

  const rows = state.choices?.rows ?? [];
  const selected = rows.find((r) => r.id === chip) ?? rows[0];
  const ids = selected ? resolvePackageIds(selected.list, data.packages) : [];

  const pickContact = async () => {
    try {
      const c = await Contacts.presentContactPickerAsync();
      const num = c?.phoneNumbers?.find((p) => p.number)?.number;
      if (num) setRaw(normalizeIndonesianMobile(num));
      else if (c) Alert.alert('Kontak', 'Kontak ini tidak punya nomor HP');
    } catch {
      Alert.alert('Kontak', 'Tidak bisa membuka daftar kontak');
    }
  };

  const choose = (packageId: string) => {
    if (!state.valid) {
      Alert.alert('Nomor HP', state.error ?? 'Masukkan nomor HP tujuan dulu');
      return;
    }
    const steps: FlowStep[] = [state.step];
    if (state.choices?.listNode && selected) steps.push({ nodeId: state.choices.listNode.id, type: 'ListNode', rowId: selected.id });
    steps.push({ nodeId: selected!.list.id, type: 'PackagesList', packageId });
    steps.forEach((s) => commit(segmentId, s));
    router.push(`/segment/${segmentId}/confirm`);
  };

  return (
    <Screen title={data.segment.label} padded={false}>
      <View style={{ backgroundColor: colors.teal, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        <View style={{ backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 12, paddingTop: 10 }}>
          <Field
            label={root.label || 'Nomor HP'}
            value={raw}
            onChangeText={setRaw}
            keyboardType="phone-pad"
            placeholder="08xxxxxxxxxx"
            error={state.error}
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
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text, paddingHorizontal: 16, paddingTop: 14 }}>
          {state.choices?.listNode?.title || selected?.list.title || 'Pilihan Paket'}
        </Text>
        {rows.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
            {rows.map((r) => (
              <Chip key={r.id} label={r.label} selected={r.id === selected?.id} onPress={() => setChip(r.id)} />
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: 8 }} />
        )}
        {!state.choices ? (
          <Empty text="Masukkan nomor HP untuk melihat paket" />
        ) : ids.length === 0 ? (
          <Empty text="Belum ada paket tersedia" />
        ) : (
          <FlatList
            data={ids}
            keyExtractor={(id) => id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
            renderItem={({ item }) => {
              const p = data.packages[item];
              return (
                <View style={{ backgroundColor: colors.white, borderRadius: 12, overflow: 'hidden', elevation: 1 }}>
                  <ListRow
                    label={p.name}
                    detail={p.description}
                    sublabel={formatRp(p.hargaAgen + data.markupTotal)}
                    sublabelColor={colors.tealDark}
                    imageUrl={p.imageUrl}
                    leading={!p.imageUrl ? <View style={{ marginRight: 12 }}><ServiceTile iconUrl={data.segment.iconUrl} slug={data.segment.slug} px={40} /></View> : undefined}
                    last
                    onPress={() => choose(p.id)}
                  />
                </View>
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}
