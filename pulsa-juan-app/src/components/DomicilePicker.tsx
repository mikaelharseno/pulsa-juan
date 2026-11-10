import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { post } from '../api/client';
import { useRegions } from '../api/hooks';
import { DomicileInput, Region } from '../api/types';
import { colors, font } from '../theme';
import { Sheet } from './Sheet';
import { Button, Field } from './ui';

// "Daerah Domisili": either share the phone's location (we turn it into
// province → kabupaten/kota → kecamatan and the agent confirms) or pick the
// three by hand. Both end in one official kecamatan code.

export interface DomicileValue {
  province: Region | null;
  regency: Region | null;
  district: Region | null;
  lat?: number;
  lng?: number;
  source: 'GPS' | 'MANUAL';
}

export const EMPTY_DOMICILE: DomicileValue = { province: null, regency: null, district: null, source: 'MANUAL' };

export function domicileInput(v: DomicileValue): DomicileInput | null {
  if (!v.district) return null;
  return { districtCode: v.district.code, source: v.source, ...(v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : {}) };
}

export function domicileText(v: DomicileValue) {
  return [v.district?.name, v.regency?.name, v.province?.name].filter(Boolean).join(', ');
}

type Tab = 'gps' | 'manual';

export function DomicilePicker({ value, onChange }: { value: DomicileValue; onChange: (v: DomicileValue) => void }) {
  const [tab, setTab] = useState<Tab>(value.source === 'GPS' ? 'gps' : 'manual');
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const locate = async () => {
    setNote(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Izin lokasi ditolak. Pilih wilayah secara manual.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      let names: { province?: string; regency?: string; city?: string; district?: string } = {};
      if (Platform.OS !== 'web') {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) names = { province: place.region ?? undefined, regency: place.subregion ?? undefined, city: place.city ?? undefined, district: place.district ?? undefined };
      }
      const m = await post<{ province: Region | null; regency: Region | null; district: Region | null }>('/agent/regions/match', names);
      onChange({ province: m.province, regency: m.regency, district: m.district, lat, lng, source: 'GPS' });
      if (m.district) setNote({ ok: true, text: 'Lokasi ditemukan. Periksa lalu ubah bila kurang tepat.' });
      else {
        setNote({ ok: false, text: m.province ? 'Lokasi tersimpan. Lengkapi kecamatan di bawah.' : 'Wilayah dari lokasi tidak dikenali. Pilih secara manual di bawah.' });
      }
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message || 'Lokasi tidak bisa dibaca' });
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>Daerah domisili</Text>
      <View style={styles.tabs}>
        {(['gps', 'manual'] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]} testID={`domicile-tab-${k}`}>
            <Ionicons name={k === 'gps' ? 'locate-outline' : 'list-outline'} size={15} color={tab === k ? colors.white : colors.ink2} />
            <Text style={[styles.tabText, tab === k && { color: colors.white }]}>{k === 'gps' ? 'Share lokasi' : 'Pilih wilayah'}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'gps' ? (
        <View style={{ marginBottom: 6 }}>
          <Button title={value.source === 'GPS' && value.lat != null ? 'Ambil ulang lokasi' : 'Bagikan lokasi saya'} icon="navigate-outline" variant="outline" loading={locating} onPress={locate} />
          {note ? <Text style={{ color: note.ok ? colors.tealDark : colors.warning, fontSize: font.small, marginTop: 6 }}>{note.text}</Text> : null}
        </View>
      ) : null}
      {tab === 'manual' || value.province ? <RegionFields value={value} onChange={(v) => onChange({ ...v, source: tab === 'gps' && value.lat != null ? 'GPS' : 'MANUAL' })} /> : null}
    </View>
  );
}

function RegionFields({ value, onChange }: { value: DomicileValue; onChange: (v: DomicileValue) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <RegionSelect
        label="Provinsi"
        parentCode={null}
        selected={value.province}
        onSelect={(r) => onChange({ ...value, province: r, regency: null, district: null })}
        testID="domicile-province"
      />
      <RegionSelect
        label="Kabupaten / Kota"
        parentCode={value.province?.code ?? undefined}
        selected={value.regency}
        onSelect={(r) => onChange({ ...value, regency: r, district: null })}
        testID="domicile-regency"
      />
      <RegionSelect
        label="Kecamatan"
        parentCode={value.regency?.code ?? undefined}
        selected={value.district}
        onSelect={(r) => onChange({ ...value, district: r })}
        testID="domicile-district"
      />
    </View>
  );
}

/** A field that opens a searchable list; `parentCode` undefined = not available yet. */
function RegionSelect({ label, parentCode, selected, onSelect, testID }: { label: string; parentCode: string | null | undefined; selected: Region | null; onSelect: (r: Region) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const disabled = parentCode === undefined;
  const list = useRegions(disabled ? null : parentCode);
  const rows = useMemo(() => {
    const all = disabled ? [] : list.data ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((r) => r.name.toLowerCase().includes(needle)) : all;
  }, [list.data, q, disabled]);

  return (
    <>
      <Pressable
        onPress={() => { setQ(''); setOpen(true); }}
        disabled={disabled}
        style={[styles.select, disabled && { opacity: 0.5 }]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.name ?? 'belum dipilih'}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.selectLabel}>{label}</Text>
          <Text style={[styles.selectValue, !selected && { color: colors.subtle }]} numberOfLines={1}>{selected?.name ?? `Pilih ${label.toLowerCase()}`}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.chevron} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <Field value={q} onChangeText={setQ} placeholder="Cari..." autoFocus={Platform.OS === 'web'} testID={`${testID}-search`} />
        <FlatList
          data={rows}
          keyExtractor={(r) => r.code}
          style={{ maxHeight: 360 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={{ color: colors.muted, padding: 8 }}>{list.isLoading ? 'Memuat...' : 'Tidak ditemukan'}</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => { onSelect(item); setOpen(false); }} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.tealTint }]}>
              <Text style={{ fontSize: font.body, color: colors.ink, fontWeight: item.code === selected?.code ? '700' : '400' }}>{item.name}</Text>
            </Pressable>
          )}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: font.small, fontWeight: '600', color: colors.ink2, marginBottom: 6 },
  tabs: { flexDirection: 'row', backgroundColor: colors.field, borderRadius: 10, padding: 3, marginBottom: 10 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8 },
  tabOn: { backgroundColor: colors.tealDark },
  tabText: { fontSize: font.small, fontWeight: '600', color: colors.ink2 },
  select: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card },
  selectLabel: { fontSize: font.tiny, color: colors.muted },
  selectValue: { fontSize: font.body, color: colors.ink, marginTop: 1 },
  option: { paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
});
