import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { formatNumberId } from 'pulsa-juan-common';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, shadow, size, track } from '../theme';

// ---- Screen: white header, ink title, grey wash body ----
export function Screen({
  title,
  children,
  back = true,
  right,
  padded = true,
}: {
  title: string;
  children: React.ReactNode;
  back?: boolean;
  right?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        {back ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={styles.headerBtn} accessibilityLabel="Kembali">
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerBtn}>{right}</View>
      </View>
      <View style={[styles.body, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
  icon,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ink' | 'outline' | 'danger' | 'ghost';
  style?: ViewStyle;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const isDisabled = disabled || loading;
  const light = variant === 'outline' || variant === 'ghost';
  const fg = light ? colors.teal : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'ink' && { backgroundColor: colors.ink },
        variant === 'outline' && styles.buttonOutline,
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && { opacity: 0.85 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  right,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string | null; hint?: string; right?: React.ReactNode; style?: ViewStyle }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={[styles.inputWrap, focused && styles.inputFocused, !!error && { borderColor: colors.danger, backgroundColor: '#FFF5F5' }]}>
        <TextInput
          placeholderTextColor={colors.subtle}
          style={styles.input}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          {...props}
        />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.white : colors.teal} style={{ marginRight: 6 }} /> : null}
      <Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

/** Charcoal tab strip with amber underline (same as the home account card). */
export function DarkTabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={styles.darkTabs}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={[styles.darkTab, active && styles.darkTabActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            {t.icon ? <Ionicons name={t.icon} size={14} color={active ? colors.accent : 'rgba(255,255,255,0.55)'} style={{ marginRight: 6 }} /> : null}
            <Text style={[styles.darkTabText, active && { color: colors.white }]}>{t.label.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Grey section band ("Bank", "Scan") used to group rows, orderkuota-style. */
export function SectionBand({ children }: { children: string }) {
  return (
    <View style={styles.band}>
      <Text style={styles.bandText}>{children}</Text>
    </View>
  );
}

/** Inset grey amount field: small label, light "Rp" prefix, large bold number. */
export function AmountField({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  autoFocus,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  placeholder?: number;
  error?: string | null;
  hint?: string;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={[styles.amountBox, focused && { borderColor: colors.teal, backgroundColor: colors.card }, !!error && { borderColor: colors.danger }]}>
        <Text style={styles.amountLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={styles.amountPrefix}>Rp</Text>
          <TextInput
            value={value ? formatNumberId(value) : ''}
            onChangeText={(t) => onChange(parseInt(t.replace(/[^\d]/g, '') || '0', 10))}
            keyboardType="number-pad"
            placeholder={placeholder ? formatNumberId(placeholder) : '0'}
            placeholderTextColor={colors.subtle}
            style={styles.amountInput}
            autoFocus={autoFocus}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </View>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Grouped-list row: 40dp image/glyph, label, optional sub, chevron. Wrap rows in <ListCard>. */
export function ListRow({
  label,
  sublabel,
  sublabelColor,
  imageUrl,
  leading,
  onPress,
  rightText,
  disabled,
  last,
}: {
  label: string;
  sublabel?: string;
  sublabelColor?: string;
  imageUrl?: string | null;
  leading?: React.ReactNode;
  onPress?: () => void;
  rightText?: string;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { backgroundColor: colors.tealTint }, disabled && { opacity: 0.5 }]}>
      {leading ?? <RowImage uri={imageUrl} fallback={label} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel} numberOfLines={2}>
          {label}
        </Text>
        {sublabel ? <Text style={[styles.rowSub, sublabelColor ? { color: sublabelColor, fontWeight: '600' } : null]}>{sublabel}</Text> : null}
      </View>
      {rightText ? <Text style={styles.rowRight}>{rightText}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.chevron} /> : null}
    </Pressable>
  );
}

export function ListCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.listCard, style]}>{children}</View>;
}

export function RowImage({ uri, fallback, sizePx = size.rowImage }: { uri?: string | null; fallback: string; sizePx?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: sizePx, height: sizePx, borderRadius: 10, marginRight: 12 }} contentFit="cover" />;
  return (
    <View style={{ width: sizePx, height: sizePx, borderRadius: 10, marginRight: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.tealDark, fontWeight: '800', fontSize: 15 }}>{fallback.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.teal} size="large" />
      {text ? <Text style={{ color: colors.muted, marginTop: 12 }}>{text}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Ionicons name="alert" size={30} color={colors.danger} />
      </View>
      <Text style={{ color: colors.ink, textAlign: 'center', fontSize: font.body, fontWeight: '500' }}>{message}</Text>
      {onRetry ? <Button title="Coba lagi" variant="outline" onPress={onRetry} style={{ marginTop: 16, minWidth: 160 }} /> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.divider, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Ionicons name="file-tray-outline" size={30} color={colors.subtle} />
      </View>
      <Text style={{ color: colors.muted, fontSize: font.body }}>{text}</Text>
    </View>
  );
}

export function KeyValue({ label, value, bold, last }: { label: string; value: string; bold?: boolean; last?: boolean }) {
  return (
    <View style={[styles.kv, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }]}>
      <Text style={[styles.kvLabel, bold && { color: colors.ink, fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.kvValue, bold && { fontWeight: '700', fontSize: 15, color: colors.ink }]}>{value}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return <Text style={styles.eyebrow}>{children.toUpperCase()}</Text>;
}

export function Pill({ label, tone = 'teal' }: { label: string; tone?: 'teal' | 'ink' | 'amber' }) {
  const map = { teal: { bg: colors.tealSoft, fg: colors.tealDark }, ink: { bg: colors.ink, fg: colors.white }, amber: { bg: '#FFF4DE', fg: '#B45309' } };
  return (
    <View style={{ backgroundColor: map[tone].bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: map[tone].fg, fontSize: font.tiny, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    PENDING: { bg: '#FFF4DE', fg: '#B45309', label: 'Diproses' },
    CLAIMED: { bg: '#FFF4DE', fg: '#B45309', label: 'Menunggu konfirmasi' },
    SUCCESS: { bg: colors.tealSoft, fg: colors.tealDark, label: 'Sukses' },
    PAID: { bg: colors.tealSoft, fg: colors.tealDark, label: 'Berhasil' },
    FAILED: { bg: '#FEE2E2', fg: colors.danger, label: 'Gagal' },
    REJECTED: { bg: '#FEE2E2', fg: colors.danger, label: 'Ditolak' },
    EXPIRED: { bg: colors.divider, fg: colors.muted, label: 'Kedaluwarsa' },
  };
  const s = map[status] ?? { bg: colors.divider, fg: colors.muted, label: status };
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.fg, marginRight: 5 }} />
      <Text style={{ color: s.fg, fontSize: font.tiny, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  header: { height: size.header, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: colors.ink, fontSize: font.headerTitle, fontWeight: '600', textAlign: 'center', letterSpacing: -0.2 },
  body: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: size.gutter },
  card: { backgroundColor: colors.card, borderRadius: size.cardRadius, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
  listCard: { backgroundColor: colors.card, borderRadius: size.cardRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden', margin: size.gutter, ...shadow.card },
  darkTabs: { flexDirection: 'row', backgroundColor: '#1C2430' },
  darkTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  darkTabActive: { borderBottomColor: colors.accent },
  darkTabText: { color: 'rgba(255,255,255,0.6)', fontSize: font.tiny, fontWeight: '600', letterSpacing: 0.6 },
  band: { backgroundColor: colors.band, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  bandText: { fontSize: font.small, color: colors.muted, fontWeight: '500' },
  amountBox: { backgroundColor: colors.field, borderRadius: 12, borderWidth: 1, borderColor: colors.field, paddingHorizontal: 16, paddingVertical: 12 },
  amountLabel: { fontSize: font.small, color: colors.muted, marginBottom: 2 },
  amountPrefix: { fontSize: 20, color: colors.ink2, fontWeight: '300', marginRight: 2, letterSpacing: -0.3 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.8, padding: 0, minHeight: 36 },
  button: { height: size.button, borderRadius: size.buttonRadius, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonOutline: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.teal },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: font.button, fontWeight: '600', letterSpacing: -0.1 },
  fieldLabel: { fontSize: font.small, color: colors.ink2, marginBottom: 6, fontWeight: '600' },
  inputWrap: { height: size.input, borderWidth: 1, borderColor: colors.field, borderRadius: size.inputRadius, backgroundColor: colors.field, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  inputFocused: { borderColor: colors.teal, backgroundColor: colors.card },
  input: { flex: 1, fontSize: font.input, color: colors.ink, height: '100%', fontWeight: '500', padding: 0 },
  fieldError: { color: colors.danger, fontSize: font.small, marginTop: 5 },
  fieldHint: { color: colors.muted, fontSize: font.small, marginTop: 5 },
  chip: { height: size.chip, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.subtle, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 8, backgroundColor: colors.card },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink2, fontSize: font.small, fontWeight: '500', letterSpacing: 0.1 },
  row: { minHeight: size.rowHeight, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowLabel: { fontSize: font.rowLabel, color: colors.ink, fontWeight: '500', letterSpacing: -0.1 },
  rowSub: { fontSize: font.rowSub, color: colors.muted, marginTop: 2 },
  rowRight: { fontSize: font.small, color: colors.ink, fontWeight: '700', marginRight: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  kvLabel: { color: colors.muted, fontSize: font.small, flex: 1, marginRight: 12 },
  kvValue: { color: colors.ink, fontSize: 13, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  sectionTitle: { fontSize: font.h2, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  eyebrow: { fontSize: font.eyebrow, fontWeight: '700', color: colors.muted, letterSpacing: track.eyebrow },
});
