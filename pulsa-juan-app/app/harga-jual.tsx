import { formatRp } from 'pulsa-juan-common';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useDeleteSellPrice, useHome, useSavedSellPrices, useSaveSellMargins, useSellMargins } from '../src/api/hooks';
import { Button, Card, ErrorView, Field, KeyValue, Loading, Screen, SectionTitle } from '../src/components/ui';
import { colors, font } from '../src/theme';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 7);

/**
 * The agent's own profit per sale, used by Rekap's income card. One default,
 * optionally overridden per service (blank = default). Changes apply to new
 * orders; a single order's price is corrected on its detail page.
 */
export default function HargaJualScreen() {
  const home = useHome();
  const margins = useSellMargins();
  const save = useSaveSellMargins();
  const [def, setDef] = useState('');
  const [bySegment, setBySegment] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!margins.data) return;
    setDef(String(margins.data.default));
    setBySegment(Object.fromEntries(Object.entries(margins.data.bySegment).map(([k, v]) => [k, String(v)])));
  }, [margins.data]);

  if (margins.isLoading || home.isLoading) return <Screen title="Harga Jual"><Loading /></Screen>;
  if (margins.isError) return <Screen title="Harga Jual"><ErrorView message={(margins.error as Error).message} onRetry={() => margins.refetch()} /></Screen>;

  const defaultRp = Number(def) || 0;
  const submit = () => {
    setMsg(null);
    const overrides = Object.fromEntries(Object.entries(bySegment).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    save.mutate({ default: defaultRp, bySegment: overrides }, { onSuccess: () => setMsg('Tersimpan') });
  };

  return (
    <Screen title="Harga Jual">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.ink2, fontSize: font.body, marginBottom: 12 }}>
            Isi untung Anda per transaksi. Harga jual ke pelanggan = harga beli + untung. Dipakai untuk menghitung keuntungan di Rekap — harga yang Anda bayar tidak berubah.
          </Text>
          <Field label="Untung per transaksi (semua layanan)" value={def} onChangeText={(v) => setDef(digits(v))} keyboardType="number-pad" placeholder="0" hint="Contoh: 2000 berarti pulsa 10.000 seharga 10.500 dijual 12.500." testID="margin-default" />
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <SectionTitle>Per layanan (opsional)</SectionTitle>
          <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 10 }}>Kosongkan untuk memakai untung di atas ({formatRp(defaultRp)}).</Text>
          {(home.data?.groups ?? []).map((g) => (
            <View key={g.groupLabel}>
              <Text style={{ color: colors.muted, fontSize: font.small, fontWeight: '700', marginBottom: 6, marginTop: 4 }}>{g.groupLabel}</Text>
              {g.segments.map((s) => (
                <Field
                  key={s.id}
                  label={s.label}
                  value={bySegment[s.id] ?? ''}
                  onChangeText={(v) => setBySegment((b) => ({ ...b, [s.id]: digits(v) }))}
                  keyboardType="number-pad"
                  placeholder={String(defaultRp)}
                />
              ))}
            </View>
          ))}
        </Card>

        <SavedPrices />

        {save.isError ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{(save.error as Error).message}</Text> : null}
        {msg ? <Text style={{ color: colors.primary, marginBottom: 8 }}>{msg}. Berlaku untuk transaksi berikutnya.</Text> : null}
        <Button title="Simpan" loading={save.isPending} onPress={submit} />
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

/** Prices saved per product from an order's "Harga jual Anda" (they beat the margins above). */
function SavedPrices() {
  const list = useSavedSellPrices();
  const remove = useDeleteSellPrice();
  const rows = list.data ?? [];
  return (
    <Card style={{ marginBottom: 12 }}>
      <SectionTitle>Harga jual per produk</SectionTitle>
      <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 6 }}>
        Tersimpan otomatis setiap kali Anda mengubah harga jual di sebuah transaksi. Harga ini dipakai untuk transaksi produk yang sama berikutnya, menggantikan untung di atas.
      </Text>
      {list.isLoading ? <Loading /> : rows.length === 0 ? <Text style={{ color: colors.subtle, fontSize: font.small, paddingVertical: 6 }}>Belum ada.</Text> : null}
      {rows.map((r, i) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <KeyValue label={r.name} value={formatRp(r.sellPrice)} last={i === rows.length - 1} />
          </View>
          <Pressable onPress={() => remove.mutate(r.id)} hitSlop={8} style={{ paddingLeft: 10 }} accessibilityLabel={`Hapus harga ${r.name}`}>
            <Text style={{ color: colors.danger, fontSize: font.small, fontWeight: '600' }}>Hapus</Text>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}
