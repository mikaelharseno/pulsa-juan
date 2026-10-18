import { PrefixEntry, Provider } from './tree/types';

// Bundled fallback for the admin-editable ProviderPrefix table (the app uses
// this list until /agent/config has loaded). Keep in sync with prisma/seed.ts.
const RAW_PREFIXES: Record<Provider, string[]> = {
  TELKOMSEL: ['0811', '0812', '0813', '0821', '0822', '0823', '0851', '0852', '0853'],
  XL: ['0817', '0818', '0819', '0859', '0877', '0878'],
  AXIS: ['0831', '0832', '0833', '0838'],
  INDOSAT: ['0814', '0815', '0816', '0855', '0856', '0857', '0858'],
  TRI: ['0895', '0896', '0897', '0898', '0899'],
  SMARTFREN: ['0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889'],
};

export const DEFAULT_PREFIXES: PrefixEntry[] = (Object.keys(RAW_PREFIXES) as Provider[]).flatMap(
  (provider) => RAW_PREFIXES[provider].map((prefix) => ({ prefix, provider })),
);

/**
 * Normalises user input to the local 08xxxxxxxxxx form: strips spaces/dashes,
 * "+62"/"62" → "0", a bare "8…" → "08…".
 */
export function normalizeIndonesianMobile(input: string): string {
  let digits = (input ?? '').replace(/[^\d]/g, '');
  if (digits.startsWith('62')) digits = '0' + digits.substring(2);
  else if (digits.startsWith('8')) digits = '0' + digits;
  return digits;
}

/** International form used by wa.me links: 08… → 628…, never a leading 0. */
export function toInternationalMobile(input: string): string {
  let digits = (input ?? '').replace(/[^\d]/g, '');
  while (digits.startsWith('0') || digits.startsWith('62')) {
    digits = digits.startsWith('62') ? digits.substring(2) : digits.substring(1);
  }
  return digits ? '62' + digits : '';
}

/** 10–13 digits starting with 08. */
export function isValidIndoMobile(normalized: string): boolean {
  return /^08\d{8,11}$/.test(normalized);
}

/** Longest-prefix match against the (admin-editable) prefix table. */
export function detectProvider(normalized: string, prefixes: PrefixEntry[] = DEFAULT_PREFIXES): Provider | null {
  if (!normalized.startsWith('08')) return null;
  let best: PrefixEntry | null = null;
  for (const entry of prefixes) {
    if (normalized.startsWith(entry.prefix) && (!best || entry.prefix.length > best.prefix.length)) {
      best = entry;
    }
  }
  return best ? best.provider : null;
}
