import { z } from 'zod';

import regionsJson from '../../data/regions.json';
import { badRequest } from '../lib/errors';

// Indonesian provinces → regencies (kabupaten/kota) → districts (kecamatan),
// from data/regions.json (built by scripts/build-regions.mjs from idn-area-data,
// ODbL). Kept in memory: ~8k rows.

export interface Region {
  code: string;
  name: string;
  parentCode: string | null;
}

const data = regionsJson as { provinces: string[][]; regencies: string[][]; districts: string[][] };
const byCode = new Map<string, Region>();
const children = new Map<string, Region[]>();
const provinces: Region[] = data.provinces.map(([code, name]) => ({ code, name, parentCode: null }));

function add(r: Region) {
  byCode.set(r.code, r);
  const key = r.parentCode ?? '';
  if (!children.has(key)) children.set(key, []);
  children.get(key)!.push(r);
}
provinces.forEach(add);
data.regencies.forEach(([code, parentCode, name]) => add({ code, name, parentCode }));
data.districts.forEach(([code, parentCode, name]) => add({ code, name, parentCode }));
for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'id'));

export function listProvinces() {
  return children.get('') ?? [];
}

/** Regencies of a province, or districts of a regency. */
export function listChildren(code: string) {
  return children.get(code) ?? [];
}

export function regionLevel(code: string): 'province' | 'regency' | 'district' | null {
  if (!byCode.has(code)) return null;
  const dots = code.split('.').length - 1;
  return dots === 0 ? 'province' : dots === 1 ? 'regency' : 'district';
}

/** Province, regency and district for a district code (null when unknown). */
export function districtPath(districtCode: string | null | undefined) {
  if (!districtCode) return null;
  const district = byCode.get(districtCode);
  if (!district || regionLevel(districtCode) !== 'district') return null;
  const regency = byCode.get(district.parentCode!)!;
  const province = byCode.get(regency.parentCode!)!;
  return { province, regency, district };
}

/** "Coblong, Kota Bandung, Jawa Barat" */
export function districtLabel(districtCode: string | null | undefined) {
  const p = districtPath(districtCode);
  return p ? `${p.district.name}, ${p.regency.name}, ${p.province.name}` : null;
}

// Geocoders spell places differently from the official list ("Kab. Bandung",
// "Bandung Regency", "DKI Jakarta", "Kecamatan Coblong"). Compare on a stripped
// form, and keep "Kota" vs "Kabupaten" apart where both exist (Kota/Kab. Bandung).
const STRIP = /\b(provinsi|province|daerah khusus ibukota|daerah istimewa|dki|di|kabupaten|kab|regency|kota administrasi|kota adm|kota|city|kecamatan|kec|district|subdistrict)\b\.?/g;
export function normalizeRegionName(name: string) {
  return name
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .replace(STRIP, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function kind(name: string): 'kota' | 'kabupaten' | null {
  const n = name.toLowerCase();
  if (/\b(kota|city)\b/.test(n)) return 'kota';
  if (/\b(kabupaten|kab|regency)\b/.test(n)) return 'kabupaten';
  return null;
}

function findIn(list: Region[], name: string | undefined, preferKind = false): Region | null {
  if (!name) return null;
  const target = normalizeRegionName(name);
  if (!target) return null;
  const hits = list.filter((r) => normalizeRegionName(r.name) === target);
  if (hits.length > 1 && preferKind) {
    const k = kind(name);
    const same = hits.find((r) => kind(r.name) === k);
    if (same) return same;
  }
  if (hits.length) return hits[0];
  // last resort: one contains the other ("Jakarta Selatan" vs "Kota Adm. Jakarta Selatan")
  const loose = list.filter((r) => {
    const n = normalizeRegionName(r.name);
    return n.length > 3 && (n.includes(target) || target.includes(n));
  });
  return loose.length === 1 ? loose[0] : null;
}

export const regionMatchSchema = z.object({
  province: z.string().trim().max(80).optional(),
  regency: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  /** some geocoders put the kabupaten/kota in "city" */
  city: z.string().trim().max(80).optional(),
});

/**
 * Matches geocoder place names to official codes as far down as it can.
 * Returns whatever level matched; the app asks the agent to confirm or finish.
 */
export function matchRegion(input: z.infer<typeof regionMatchSchema>) {
  const province = findIn(listProvinces(), input.province);
  if (!province) return { province: null, regency: null, district: null };
  const regencies = listChildren(province.code);
  const regency = findIn(regencies, input.regency, true) ?? findIn(regencies, input.city, true);
  if (!regency) return { province, regency: null, district: null };
  const district = findIn(listChildren(regency.code), input.district);
  return { province, regency, district };
}

export const domicileSchema = z.object({
  districtCode: z.string().trim().regex(/^\d{2}\.\d{2}\.\d{2}$/, 'Kecamatan tidak valid'),
  lat: z.number().min(-12).max(7).optional(),
  lng: z.number().min(94).max(142).optional(),
  source: z.enum(['GPS', 'MANUAL']),
});
export type DomicileInput = z.infer<typeof domicileSchema>;

/** Agent columns for a domicile; throws when the district code is unknown. */
export function domicileData(input: DomicileInput) {
  const path = districtPath(input.districtCode);
  if (!path) throw badRequest('Kecamatan tidak ditemukan', 'REGION_INVALID');
  return {
    domicileProvinceCode: path.province.code,
    domicileRegencyCode: path.regency.code,
    domicileDistrictCode: path.district.code,
    domicileLat: input.lat ?? null,
    domicileLng: input.lng ?? null,
    domicileSource: input.source,
  };
}
