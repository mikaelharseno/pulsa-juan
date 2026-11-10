import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { formatRp, toInternationalMobile } from 'pulsa-juan-common';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useBonLink, useMe, useSetSellPrice } from '../api/hooks';
import { Transaction } from '../api/types';
import { colors, font } from '../theme';
import { openExternal } from './home';
import { Sheet } from './Sheet';
import { Button, Card, Field, KeyValue, SectionTitle } from './ui';

// The agent's price to its customer and the customer's PDF bon. Shown on the
// order status page and, from the Transaksi list, in a sheet. Nothing here
// shows the agent's own cost or profit: the agent may hand the phone over.

/** The product line for the bon text: the package name when there is one. */
export function productName(t: Transaction) {
  return t.summary.find((r) => r.label === 'Paket')?.value ?? t.segmentLabel;
}

/** The agent's own price to its customer (saved for this product on save). */
export function SellPriceCard({ t, card = true }: { t: Transaction; card?: boolean }) {
  const setPrice = useSetSellPrice(t.id);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const sell = t.sellPrice ?? t.total;

  const body = (
    <>
      <SectionTitle
        right={
          !editing ? (
            <Text style={{ color: colors.teal, fontWeight: '700', fontSize: font.body }} onPress={() => { setValue(String(sell)); setEditing(true); }}>
              Ubah
            </Text>
          ) : undefined
        }
      >
        Harga jual Anda
      </SectionTitle>
      {editing ? (
        <>
          <Field
            label="Harga jual ke pelanggan"
            value={value}
            onChangeText={(v) => setValue(v.replace(/\D/g, '').slice(0, 9))}
            keyboardType="number-pad"
            autoFocus
            hint={t.packageId ? 'Disimpan untuk produk ini: transaksi berikutnya otomatis memakai harga ini.' : undefined}
            testID="sell-price"
          />
          {setPrice.isError ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{(setPrice.error as Error).message}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Batal" variant="outline" style={{ flex: 1 }} onPress={() => setEditing(false)} />
            <Button title="Simpan" style={{ flex: 1 }} loading={setPrice.isPending} disabled={!value} onPress={() => setPrice.mutate(Number(value), { onSuccess: () => setEditing(false) })} />
          </View>
        </>
      ) : (
        <KeyValue label="Harga jual" value={formatRp(sell)} bold last />
      )}
    </>
  );
  return card ? <Card style={{ marginBottom: 12 }}>{body}</Card> : <View style={{ marginBottom: 12 }}>{body}</View>;
}

const fileName = (t: Transaction) => `bon-${t.trxNumber}.pdf`;

/** Downloads the bon PDF into the app cache and returns its local uri. */
async function downloadBon(url: string, t: Transaction) {
  const target = `${FileSystem.cacheDirectory}${fileName(t)}`;
  const res = await FileSystem.downloadAsync(url, target);
  if (res.status !== 200) throw new Error('Bon gagal diunduh');
  return res.uri;
}

/** "Simpan file": Android lets the agent pick a folder; web downloads it. */
async function saveBon(url: string, t: Transaction) {
  if (Platform.OS === 'web') {
    openExternal(`${url}?download=1`);
    return null;
  }
  const local = await downloadBon(url, t);
  if (Platform.OS !== 'android') {
    await Sharing.shareAsync(local, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return null;
  }
  const saf = FileSystem.StorageAccessFramework;
  const perm = await saf.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  const dest = await saf.createFileAsync(perm.directoryUri, `bon-${t.trxNumber}`, 'application/pdf');
  const data = await FileSystem.readAsStringAsync(local, { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.writeAsStringAsync(dest, data, { encoding: FileSystem.EncodingType.Base64 });
  return fileName(t);
}

/** "Bagikan": the PDF file through the system share sheet. */
async function shareBon(url: string, t: Transaction) {
  if (Platform.OS === 'web') {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) await nav.share({ title: `Bon #${t.trxNumber}`, url });
    else openExternal(url);
    return;
  }
  const local = await downloadBon(url, t);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Berbagi file tidak tersedia di perangkat ini');
  await Sharing.shareAsync(local, { mimeType: 'application/pdf', dialogTitle: `Bon #${t.trxNumber}`, UTI: 'com.adobe.pdf' });
}

export function bonWhatsappText(t: Transaction, seller: string, url: string) {
  const dest = t.phoneNumber ?? t.customerId;
  return [
    `Bon transaksi #${t.trxNumber}${seller ? ` dari ${seller}` : ''}`,
    `${productName(t)}${dest ? ` ke ${dest}` : ''}`,
    `Total: ${formatRp(t.sellPrice ?? t.total)}`,
    '',
    `Lihat bon (PDF): ${url}`,
  ].join('\n');
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${toInternationalMobile(phone)}?text=${encodeURIComponent(text)}`;
}

/** Three ways to hand the customer its bon: save the file, WhatsApp a link, share the file. */
export function BonActions({ t }: { t: Transaction }) {
  const link = useBonLink();
  const me = useMe();
  const [busy, setBusy] = useState<'save' | 'wa' | 'share' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waUrl, setWaUrl] = useState('');

  const run = async (kind: 'save' | 'wa' | 'share') => {
    setMsg(null);
    setBusy(kind);
    try {
      const { url } = await link.mutateAsync(t.id);
      if (kind === 'wa') {
        setWaUrl(url);
        setWaPhone(t.phoneNumber ?? '');
        setWaOpen(true);
      } else if (kind === 'save') {
        const saved = await saveBon(url, t);
        if (saved) setMsg({ ok: true, text: `${saved} tersimpan.` });
      } else {
        await shareBon(url, t);
      }
    } catch (e) {
      const text = (e as Error).message || 'Gagal membuat bon';
      if (Platform.OS === 'web') setMsg({ ok: false, text });
      else Alert.alert('Bon', text);
    } finally {
      setBusy(null);
    }
  };

  const phoneOk = toInternationalMobile(waPhone).length >= 10;
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <BonButton icon="download-outline" label="Simpan file" busy={busy === 'save'} onPress={() => run('save')} testID="bon-save" />
        <BonButton icon="logo-whatsapp" label="WhatsApp" busy={busy === 'wa'} onPress={() => run('wa')} testID="bon-wa" />
        <BonButton icon="share-social-outline" label="Bagikan" busy={busy === 'share'} onPress={() => run('share')} testID="bon-share" />
      </View>
      {msg ? <Text style={{ color: msg.ok ? colors.tealDark : colors.danger, fontSize: font.small, marginTop: 8 }}>{msg.text}</Text> : null}
      <Sheet visible={waOpen} onClose={() => setWaOpen(false)} title="Kirim bon via WhatsApp">
        <Field
          label="Nomor WhatsApp tujuan"
          value={waPhone}
          onChangeText={setWaPhone}
          keyboardType="phone-pad"
          placeholder="08xx"
          autoFocus
          hint="Bisa diganti ke nomor lain yang akan menerima bon."
          testID="bon-wa-phone"
        />
        <Button
          title="Kirim ke WhatsApp"
          icon="logo-whatsapp"
          disabled={!phoneOk}
          onPress={() => {
            openExternal(waLink(waPhone, bonWhatsappText(t, me.data?.name ?? '', waUrl)));
            setWaOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}

function BonButton({ icon, label, onPress, busy, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; busy?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} disabled={busy} testID={testID} style={({ pressed }) => [styles.bonBtn, pressed && { backgroundColor: colors.tealTint }, busy && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={18} color={colors.tealDark} />
      <Text style={styles.bonBtnText}>{busy ? '...' : label}</Text>
    </Pressable>
  );
}

/** The "Kirim bon" card under the sell price. */
export function BonCard({ t, card = true }: { t: Transaction; card?: boolean }) {
  const body = (
    <>
      <SectionTitle>Kirim bon</SectionTitle>
      <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 10 }}>PDF berisi produk, nomor tujuan dan harga jual Anda.</Text>
      <BonActions t={t} />
    </>
  );
  return card ? <Card style={{ marginBottom: 12 }}>{body}</Card> : <View>{body}</View>;
}

const styles = StyleSheet.create({
  bonBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.subtle, backgroundColor: colors.card, gap: 4 },
  bonBtnText: { fontSize: font.tiny, fontWeight: '600', color: colors.ink2 },
});
