// Built-in service icons: framework-agnostic SVG data (48x48 viewBox) so the
// Expo app (react-native-svg) and the dashboard (DOM <svg>) draw the same
// glyphs. A Segment references one via iconUrl = "builtin:<key>".

export type IconEl =
  | { type: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; linecap?: 'round' | 'butt' }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { type: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill?: string; opacity?: number }
  | { type: 'text'; text: string; x: number; y: number; size: number; weight?: number; fill?: string; spacing?: number };

export interface IconSpec {
  key: string;
  label: string;
  /** tile background */
  bg: string;
  /** default glyph colour */
  fg: string;
  accent: string;
  elements: IconEl[];
}

const TEAL = '#12A594';
const TEAL_SOFT = '#E3F4F1';
const AMBER = '#F59E0B';

function badge(key: string, label: string, color: string, tint: string, text: string, size = 20, spacing = 0): IconSpec {
  return {
    key,
    label,
    bg: tint,
    fg: color,
    accent: '#FFFFFF',
    elements: [
      { type: 'circle', cx: 24, cy: 24, r: 17, fill: 'fg' },
      { type: 'text', text, x: 24, y: 24, size, weight: 800, fill: 'accent', spacing },
    ],
  };
}

const wallet = (key: string, label: string, color: string, tint: string, letter: string): IconSpec => ({
  key,
  label,
  bg: tint,
  fg: color,
  accent: '#FFFFFF',
  elements: [
    { type: 'rect', x: 7, y: 15, w: 34, h: 24, rx: 6, fill: 'fg' },
    { type: 'rect', x: 7, y: 11, w: 26, h: 8, rx: 3, fill: 'fg', opacity: 0.55 },
    { type: 'rect', x: 29, y: 23, w: 12, h: 9, rx: 3, fill: 'accent', opacity: 0.9 },
    { type: 'circle', cx: 34.5, cy: 27.5, r: 1.8, fill: 'fg' },
    { type: 'text', text: letter, x: 17, y: 28, size: 11, weight: 800, fill: 'accent' },
  ],
});

export const ICONS: Record<string, IconSpec> = {
  pulsa: {
    key: 'pulsa', label: 'Pulsa', bg: TEAL_SOFT, fg: TEAL, accent: AMBER,
    elements: [
      { type: 'rect', x: 12, y: 6, w: 20, h: 36, rx: 5, fill: 'fg' },
      { type: 'rect', x: 15, y: 11, w: 14, h: 22, rx: 2, fill: '#FFFFFF', opacity: 0.9 },
      { type: 'circle', cx: 22, cy: 37.5, r: 1.6, fill: '#FFFFFF' },
      { type: 'rect', x: 34, y: 22, w: 3, h: 7, rx: 1.5, fill: 'accent' },
      { type: 'rect', x: 38.5, y: 17, w: 3, h: 12, rx: 1.5, fill: 'accent' },
      { type: 'rect', x: 43, y: 12, w: 3, h: 17, rx: 1.5, fill: 'accent' },
    ],
  },
  'paket-data': {
    key: 'paket-data', label: 'Paket Data', bg: TEAL_SOFT, fg: TEAL, accent: AMBER,
    elements: [
      { type: 'path', d: 'M8 22 C17 13 31 13 40 22', stroke: 'fg', strokeWidth: 4, linecap: 'round' },
      { type: 'path', d: 'M14 29 C20 23 28 23 34 29', stroke: 'fg', strokeWidth: 4, linecap: 'round', opacity: 0.75 },
      { type: 'circle', cx: 24, cy: 37, r: 4.5, fill: 'accent' },
    ],
  },
  internet: {
    key: 'internet', label: 'Internet', bg: '#E8F1FB', fg: '#2563EB', accent: AMBER,
    elements: [
      { type: 'circle', cx: 24, cy: 24, r: 17, stroke: 'fg', strokeWidth: 3.5 },
      { type: 'path', d: 'M7 24 H41 M24 7 C17 14 17 34 24 41 M24 7 C31 14 31 34 24 41', stroke: 'fg', strokeWidth: 3, linecap: 'round' },
    ],
  },
  'telepon-sms': {
    key: 'telepon-sms', label: 'Telepon & SMS', bg: TEAL_SOFT, fg: TEAL, accent: AMBER,
    elements: [
      { type: 'rect', x: 6, y: 9, w: 28, h: 20, rx: 6, fill: 'fg' },
      { type: 'path', d: 'M12 29 L12 36 L20 29 Z', fill: 'fg' },
      { type: 'circle', cx: 14, cy: 19, r: 2, fill: '#FFFFFF' },
      { type: 'circle', cx: 20, cy: 19, r: 2, fill: '#FFFFFF' },
      { type: 'circle', cx: 26, cy: 19, r: 2, fill: '#FFFFFF' },
      { type: 'path', d: 'M30 28 c2 8 8 14 14 14 c1 0 2-1 2-2 l-1-5 c0-1-1-2-2-2 l-3 1 c-3-1-5-3-6-6 l1-3 c0-1-1-2-2-2 l-5-1 c-1 0-2 1-2 2 c0 2 1 3 4 4 z', fill: 'accent' },
    ],
  },
  'token-pln': {
    key: 'token-pln', label: 'Token PLN', bg: '#FFF4DE', fg: AMBER, accent: '#0F172A',
    elements: [{ type: 'path', d: 'M27 4 L11 27 H23 L20 44 L37 20 H25 Z', fill: 'fg' }],
  },
  'pln-pascabayar': {
    key: 'pln-pascabayar', label: 'PLN Pascabayar', bg: TEAL_SOFT, fg: TEAL, accent: AMBER,
    elements: [
      { type: 'rect', x: 11, y: 6, w: 26, h: 36, rx: 4, fill: 'fg' },
      { type: 'rect', x: 16, y: 31, w: 16, h: 2.5, rx: 1, fill: '#FFFFFF', opacity: 0.8 },
      { type: 'rect', x: 16, y: 36, w: 10, h: 2.5, rx: 1, fill: '#FFFFFF', opacity: 0.8 },
      { type: 'path', d: 'M25.5 10 L18 22 H24 L22.5 29 L30.5 17 H24.5 Z', fill: 'accent' },
    ],
  },
  'tagihan-air': {
    key: 'tagihan-air', label: 'Tagihan Air', bg: '#E8F1FB', fg: '#2563EB', accent: '#FFFFFF',
    elements: [
      { type: 'path', d: 'M24 5 C24 5 10 21 10 30 a14 14 0 0 0 28 0 C38 21 24 5 24 5 Z', fill: 'fg' },
      { type: 'path', d: 'M17 31 a7 7 0 0 0 5 7', stroke: 'accent', strokeWidth: 3, linecap: 'round', opacity: 0.85 },
    ],
  },
  bpjs: {
    key: 'bpjs', label: 'BPJS', bg: TEAL_SOFT, fg: TEAL, accent: '#FFFFFF',
    elements: [
      { type: 'path', d: 'M24 5 L40 11 V24 C40 34 33 41 24 44 C15 41 8 34 8 24 V11 Z', fill: 'fg' },
      { type: 'rect', x: 21.5, y: 16, w: 5, h: 17, rx: 1.5, fill: 'accent' },
      { type: 'rect', x: 15.5, y: 22, w: 17, h: 5, rx: 1.5, fill: 'accent' },
    ],
  },
  tv: {
    key: 'tv', label: 'TV Prabayar', bg: '#EEE9FB', fg: '#6D28D9', accent: AMBER,
    elements: [
      { type: 'rect', x: 6, y: 11, w: 36, h: 24, rx: 4, fill: 'fg' },
      { type: 'rect', x: 10, y: 15, w: 28, h: 16, rx: 2, fill: '#FFFFFF', opacity: 0.85 },
      { type: 'rect', x: 16, y: 38, w: 16, h: 3, rx: 1.5, fill: 'fg' },
      { type: 'path', d: 'M21 19 L28 23 L21 27 Z', fill: 'accent' },
    ],
  },
  voucher: {
    key: 'voucher', label: 'Voucher', bg: '#FFF4DE', fg: AMBER, accent: '#FFFFFF',
    elements: [
      { type: 'path', d: 'M6 14 a3 3 0 0 1 3-3 h30 a3 3 0 0 1 3 3 v6 a4 4 0 0 0 0 8 v6 a3 3 0 0 1-3 3 H9 a3 3 0 0 1-3-3 v-6 a4 4 0 0 0 0-8 Z', fill: 'fg' },
      { type: 'path', d: 'M28 15 V33', stroke: 'accent', strokeWidth: 2.5, linecap: 'round', opacity: 0.9 },
    ],
  },
  emoney: {
    key: 'emoney', label: 'E-Money', bg: TEAL_SOFT, fg: TEAL, accent: AMBER,
    elements: [
      { type: 'rect', x: 5, y: 11, w: 38, h: 26, rx: 5, fill: 'fg' },
      { type: 'rect', x: 5, y: 17, w: 38, h: 5, fill: '#0F172A', opacity: 0.35 },
      { type: 'rect', x: 10, y: 27, w: 10, h: 5, rx: 1.5, fill: 'accent' },
    ],
  },
  transfer: {
    key: 'transfer', label: 'Transfer', bg: TEAL_SOFT, fg: TEAL, accent: AMBER,
    elements: [
      { type: 'path', d: 'M10 17 H34 M28 10 L35 17 L28 24', stroke: 'fg', strokeWidth: 4, linecap: 'round' },
      { type: 'path', d: 'M38 31 H14 M20 24 L13 31 L20 38', stroke: 'accent', strokeWidth: 4, linecap: 'round' },
    ],
  },
  game: {
    key: 'game', label: 'Game', bg: '#EEE9FB', fg: '#6D28D9', accent: AMBER,
    elements: [
      { type: 'path', d: 'M14 13 H34 a10 10 0 0 1 10 10 v6 a7 7 0 0 1-12 5 l-3-3 H19 l-3 3 a7 7 0 0 1-12-5 v-6 a10 10 0 0 1 10-10 Z', fill: 'fg' },
      { type: 'rect', x: 12, y: 21, w: 3, h: 9, rx: 1.5, fill: '#FFFFFF' },
      { type: 'rect', x: 9, y: 24, w: 9, h: 3, rx: 1.5, fill: '#FFFFFF' },
      { type: 'circle', cx: 34, cy: 23, r: 2.2, fill: 'accent' },
      { type: 'circle', cx: 38, cy: 27, r: 2.2, fill: '#FFFFFF' },
    ],
  },
  'mobile-legends': {
    key: 'mobile-legends', label: 'Mobile Legends', bg: '#E8F1FB', fg: '#1D4ED8', accent: AMBER,
    elements: [
      { type: 'path', d: 'M11 37 L33 11 L37 15 L15 41 Z', fill: 'fg' },
      { type: 'path', d: 'M37 37 L15 11 L11 15 L33 41 Z', fill: 'fg', opacity: 0.8 },
      { type: 'circle', cx: 24, cy: 26, r: 4.5, fill: 'accent' },
      { type: 'rect', x: 7, y: 39, w: 9, h: 3, rx: 1.5, fill: '#0F172A' },
      { type: 'rect', x: 32, y: 39, w: 9, h: 3, rx: 1.5, fill: '#0F172A' },
    ],
  },
  'free-fire': {
    key: 'free-fire', label: 'Free Fire', bg: '#FFECE6', fg: '#EA580C', accent: AMBER,
    elements: [
      { type: 'path', d: 'M25 4 C30 12 38 16 38 27 a14 14 0 0 1-28 0 c0-6 3-9 6-13 c0 4 2 6 4 7 c-1-7 2-12 5-17 Z', fill: 'fg' },
      { type: 'path', d: 'M24 22 c3 4 6 6 6 11 a6 6 0 0 1-12 0 c0-3 2-5 3-7 c0 2 1 3 2 3 c0-3 0-5 1-7 Z', fill: 'accent' },
    ],
  },
  lainnya: {
    key: 'lainnya', label: 'Lainnya', bg: '#EEF1F4', fg: '#334155', accent: TEAL,
    elements: [
      { type: 'rect', x: 8, y: 8, w: 13, h: 13, rx: 4, fill: 'fg' },
      { type: 'rect', x: 27, y: 8, w: 13, h: 13, rx: 4, fill: 'fg' },
      { type: 'rect', x: 8, y: 27, w: 13, h: 13, rx: 4, fill: 'fg' },
      { type: 'rect', x: 27, y: 27, w: 13, h: 13, rx: 4, fill: 'accent' },
    ],
  },
  // operators — stylised letter badges in brand-leaning colours
  telkomsel: badge('telkomsel', 'Telkomsel', '#E11D2E', '#FDECEE', 'T', 22),
  xl: badge('xl', 'XL', '#1D4ED8', '#E8EEFB', 'XL', 15, 0.5),
  axis: badge('axis', 'Axis', '#7C3AED', '#F0E9FD', 'A', 22),
  indosat: badge('indosat', 'Indosat', '#EAB308', '#FEF7DC', 'im3', 12, -0.3),
  tri: badge('tri', 'Tri', '#4C1D95', '#EDE7F8', '3', 24),
  smartfren: badge('smartfren', 'Smartfren', '#DB2777', '#FCE7F1', 'S', 22),
  byu: badge('byu', 'by.U', '#0F3D91', '#E6ECF8', 'by.U', 11, -0.2),
  // e-wallets
  gopay: wallet('gopay', 'Gopay', '#00AA13', '#E5F7E8', 'G'),
  ovo: wallet('ovo', 'OVO', '#4C3494', '#EDE9F8', 'O'),
  dana: wallet('dana', 'DANA', '#108EE9', '#E4F2FD', 'D'),
  shopeepay: wallet('shopeepay', 'ShopeePay', '#EE4D2D', '#FDE8E3', 'S'),
  linkaja: wallet('linkaja', 'LinkAja', '#E31E24', '#FCE6E7', 'L'),
  ewallet: wallet('ewallet', 'E-Wallet', TEAL, TEAL_SOFT, '$'),
};

export const ICON_KEYS = Object.keys(ICONS);

export const BUILTIN_PREFIX = 'builtin:';

/** "builtin:xl" → ICONS.xl; a bare slug also resolves; otherwise null. */
export function builtinIcon(iconUrl: string | null | undefined, slug?: string): IconSpec | null {
  if (iconUrl && iconUrl.startsWith(BUILTIN_PREFIX)) return ICONS[iconUrl.slice(BUILTIN_PREFIX.length)] ?? ICONS.lainnya;
  if (iconUrl) return null; // a real image URL
  if (slug && ICONS[slug]) return ICONS[slug];
  return ICONS.lainnya;
}

export function resolveIconColor(spec: IconSpec, value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value === 'fg') return spec.fg;
  if (value === 'accent') return spec.accent;
  if (value === 'bg') return spec.bg;
  return value;
}
