import { Provider } from './tree/types';

// OtomaX "Produk" export (TSV: Aktif, Kode, Nama, Provider, ..., Nominal, Hrg Beli,
// Hrg Jual, Kosong, Gangguan, ...) → Product Updater rows. "Provider" in the export
// is the OtomaX product group (ID, I, THD, SBU, ...), mapped here to an app operator
// and a category. The app's cost is Hrg Beli: the app's reseller account is set to
// pay Hrg Beli in OtomaX (harga jual = harga beli), so all margin is set in the app.

export interface OtomaxExportRow {
  active: boolean;
  code: string;
  name: string;
  group: string;
  nominal: number;
  hargaBeli: number;
  hargaJual: number;
  /** Kosong or Gangguan flagged in OtomaX */
  unavailable: boolean;
}

export type OtomaxGroupKind = 'PULSA' | 'DATA' | 'OTHER';

export interface OtomaxGroupMapping {
  operator: Provider;
  label: string;
  kind: OtomaxGroupKind;
  /** imported unless the admin turns it off */
  include: boolean;
  note?: string;
}

/** OtomaX product groups of our center → operator + category. Groups not listed are not operator products. */
export const OTOMAX_GROUPS: Record<string, OtomaxGroupMapping> = {
  I: { operator: 'INDOSAT', label: 'Pulsa', kind: 'PULSA', include: true },
  ID: { operator: 'INDOSAT', label: 'Data', kind: 'DATA', include: true },
  AV: { operator: 'INDOSAT', label: 'Aktivasi Voucher', kind: 'OTHER', include: false, note: 'cek dulu sebelum dijual' },
  T: { operator: 'TRI', label: 'Pulsa', kind: 'PULSA', include: true },
  THD: { operator: 'TRI', label: 'Data', kind: 'DATA', include: true },
  TRD: { operator: 'TRI', label: 'Data', kind: 'DATA', include: true },
  AON: { operator: 'TRI', label: 'AON', kind: 'OTHER', include: true },
  TT: { operator: 'TRI', label: 'Telepon', kind: 'OTHER', include: true },
  VT: { operator: 'TRI', label: 'Voucher', kind: 'OTHER', include: false, note: 'voucher isi beberapa, cek dulu' },
  S: { operator: 'TELKOMSEL', label: 'Pulsa', kind: 'PULSA', include: true },
  TM: { operator: 'TELKOMSEL', label: 'Pulsa Mix', kind: 'PULSA', include: false, note: 'nominal sama dengan pulsa S' },
  SBU: { operator: 'TELKOMSEL', label: 'by.U', kind: 'PULSA', include: true },
  TDF: { operator: 'TELKOMSEL', label: 'Data', kind: 'DATA', include: true },
  TD: { operator: 'TELKOMSEL', label: 'Data', kind: 'DATA', include: true },
  TS: { operator: 'TELKOMSEL', label: 'SMS', kind: 'OTHER', include: true },
  TPT: { operator: 'TELKOMSEL', label: 'Telepon', kind: 'OTHER', include: true },
  X: { operator: 'XL', label: 'Pulsa', kind: 'PULSA', include: true },
  XD: { operator: 'XL', label: 'Data', kind: 'DATA', include: true },
  XT: { operator: 'XL', label: 'Telepon', kind: 'OTHER', include: true },
  AX: { operator: 'AXIS', label: 'Pulsa', kind: 'PULSA', include: true },
  AXD: { operator: 'AXIS', label: 'Data', kind: 'DATA', include: true },
  SM: { operator: 'SMARTFREN', label: 'Pulsa', kind: 'PULSA', include: true },
  SMD: { operator: 'SMARTFREN', label: 'Data', kind: 'DATA', include: true },
};

/** Category order inside an operator tile; unknown categories go last. */
const CATEGORY_ORDER = [
  'Pulsa', 'Pulsa Mix', 'by.U', 'Data Harian', 'Data Mingguan', 'Data Bulanan', 'Data', '5G', 'HiFi Air', 'AON',
  'Aktivasi Voucher', 'Voucher', 'Telepon', 'SMS', 'Masa Aktif',
];

const clean = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();
const num = (s: string) => {
  const n = Number(clean(s).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** True when the header row is an OtomaX product export. */
export function isOtomaxExport(header: string[]) {
  const h = header.map((c) => clean(c).toUpperCase());
  return ['KODE', 'NAMA', 'PROVIDER', 'HRG BELI'].every((c) => h.includes(c));
}

export function readOtomaxExport(rows: string[][]): OtomaxExportRow[] {
  const headerIdx = rows.findIndex(isOtomaxExport);
  if (headerIdx < 0) throw new Error('Bukan file ekspor produk OtomaX (kolom Kode / Nama / Provider / Hrg Beli tidak ditemukan)');
  const h = rows[headerIdx].map((c) => clean(c).toUpperCase());
  const col = (name: string) => h.indexOf(name);
  const c = {
    active: col('AKTIF'), code: col('KODE'), name: col('NAMA'), group: col('PROVIDER'), nominal: col('NOMINAL'),
    beli: col('HRG BELI'), jual: col('HRG JUAL'), kosong: col('KOSONG'), gangguan: col('GANGGUAN'),
  };
  const flag = (r: string[], i: number) => i >= 0 && clean(r[i] ?? '') === '1';
  return rows
    .slice(headerIdx + 1)
    .filter((r) => clean(r[c.code] ?? ''))
    .map((r) => ({
      active: c.active < 0 || clean(r[c.active] ?? '') === '1',
      code: clean(r[c.code]),
      name: clean(r[c.name] ?? ''),
      group: clean(r[c.group] ?? '').toUpperCase(),
      nominal: c.nominal >= 0 ? num(r[c.nominal] ?? '') : 0,
      hargaBeli: c.beli >= 0 ? num(r[c.beli] ?? '') : 0,
      hargaJual: num(r[c.jual] ?? ''),
      unavailable: flag(r, c.kosong) || flag(r, c.gangguan),
    }));
}

/** Validity in days from names like "7GB/1 H", "5 HARI", "(7Hari)", "30hr", "1GB(24Jam)". */
export function validityDays(name: string): number | null {
  const n = name.toUpperCase();
  const days = /(\d+)\s*(?:HARI|HR|H)\b/.exec(n) ?? /(\d+)\s*HARI/.exec(n);
  if (days) return Number(days[1]);
  const hours = /(\d+)\s*JAM/.exec(n);
  return hours ? Math.max(1, Math.ceil(Number(hours[1]) / 24)) : null;
}

/** Category of one product: keyword categories first, then data by validity. */
export function otomaxCategory(group: OtomaxGroupMapping, name: string): string {
  const n = name.toUpperCase();
  const hasQuota = /\d\s*(GB|MB)\b|\bGB\b/.test(n);
  if (/MASA AKTIF/.test(n)) return 'Masa Aktif';
  if (group.kind === 'OTHER') return group.label;
  if (!hasQuota && /\bSMS\b/.test(n)) return 'SMS';
  if (!hasQuota && /TELP|TELEPON|OBROL|NELP|MENIT|\bMNT\b/.test(n)) return 'Telepon';
  if (group.kind === 'PULSA') return group.label;
  if (/HIFI/.test(n)) return 'HiFi Air';
  if (/\b5G\b/.test(n)) return '5G';
  if (/\bAON\b/.test(n)) return 'AON';
  const days = validityDays(n);
  if (days === null) return group.label;
  return days <= 3 ? 'Data Harian' : days <= 14 ? 'Data Mingguan' : 'Data Bulanan';
}

export type SkipReason = 'INACTIVE' | 'UNAVAILABLE' | 'EXCLUDED' | 'UNSUPPORTED' | 'DUPLICATE' | 'NO_PRICE';

export interface OtomaxImportRow {
  provider: Provider;
  sku: string;
  name: string;
  category: string;
  description: string;
  cost: number;
}

export interface OtomaxGroupSummary {
  group: string;
  mapping: OtomaxGroupMapping | null;
  include: boolean;
  total: number;
  imported: number;
  skipped: Partial<Record<SkipReason, number>>;
  examples: string[];
}

/**
 * Rows to import + a per-group summary. `include` overrides the default on/off per group.
 * Identical products inside one operator (same name and price, e.g. I5/IH5/IZ5) are
 * imported once; products sharing a name at different prices get the nominal appended.
 */
export function planOtomaxImport(rows: OtomaxExportRow[], include: Record<string, boolean> = {}) {
  const groups = new Map<string, OtomaxGroupSummary>();
  const picked: (OtomaxImportRow & { order: number; group: string; nominal: number })[] = [];
  const seen = new Set<string>();
  rows.forEach((r, order) => {
    const mapping = OTOMAX_GROUPS[r.group] ?? null;
    let g = groups.get(r.group);
    if (!g) {
      g = { group: r.group, mapping, include: mapping ? include[r.group] ?? mapping.include : false, total: 0, imported: 0, skipped: {}, examples: [] };
      groups.set(r.group, g);
    }
    g.total++;
    if (g.examples.length < 3 && r.active) g.examples.push(`${r.code} ${r.name}`.trim());
    const skip = (reason: SkipReason) => {
      g!.skipped[reason] = (g!.skipped[reason] ?? 0) + 1;
    };
    if (!mapping) return skip('UNSUPPORTED');
    if (!g.include) return skip('EXCLUDED');
    if (!r.active) return skip('INACTIVE');
    if (r.unavailable) return skip('UNAVAILABLE');
    if (r.hargaBeli <= 0) return skip('NO_PRICE');
    const name = r.name || r.code;
    const key = `${mapping.operator}|${name.toUpperCase()}|${r.hargaBeli}`;
    if (seen.has(key)) return skip('DUPLICATE');
    seen.add(key);
    g.imported++;
    picked.push({
      provider: mapping.operator,
      sku: r.code,
      name,
      category: otomaxCategory(mapping, name),
      description: '',
      cost: r.hargaBeli,
      order,
      group: r.group,
      nominal: r.nominal,
    });
  });

  // same name, different price ("TSel", "TSel MIX Mochan") → add the nominal or code
  const nameKey = (p: { provider: string; name: string }) => `${p.provider}|${p.name.toUpperCase()}`;
  const nameCount = new Map<string, number>();
  for (const p of picked) nameCount.set(nameKey(p), (nameCount.get(nameKey(p)) ?? 0) + 1);
  for (const p of picked) {
    if ((nameCount.get(nameKey(p)) ?? 0) > 1) p.name = `${p.name} ${p.nominal > 0 ? `${p.nominal}K` : p.sku}`;
  }

  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  picked.sort((a, b) => a.provider.localeCompare(b.provider) || rank(a.category) - rank(b.category) || a.cost - b.cost || a.order - b.order);
  const importRows: OtomaxImportRow[] = picked.map(({ provider, sku, name, category, description, cost }) => ({ provider, sku, name, category, description, cost }));
  return { rows: importRows, groups: [...groups.values()] };
}
