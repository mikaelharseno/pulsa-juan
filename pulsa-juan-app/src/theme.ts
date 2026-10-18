// Design tokens — "terbebas.ai in teal": near-black ink, soft grey wash,
// teal accent, tight heading tracking, 12–14 radii (orderkuota-style layout).
export const colors = {
  teal: '#12A594',
  tealDark: '#0B7C70',
  tealDeep: '#075E56',
  tealHeader: '#0A6B60',
  tealSoft: '#E3F4F1',
  tealTint: '#F0FAF8',
  ink: '#0F172A',
  ink2: '#334155',
  muted: '#64748B',
  subtle: '#94A3B8',
  bg: '#F5F6F8',
  card: '#FFFFFF',
  border: '#E2E6EA',
  divider: '#ECEFF2',
  hairline: '#E6EAEE',
  band: '#F4F6F8',
  field: '#F2F4F6',
  chevron: '#C4CBD1',
  accent: '#F59E0B',
  danger: '#DC2626',
  success: '#12A594',
  warning: '#D97706',
  white: '#FFFFFF',
  // legacy aliases still used by a few screens
  primary: '#12A594',
  primaryDark: '#0B7C70',
  primaryRing: '#E3F4F1',
  text: '#0F172A',
};

export const font = {
  h1: 22,
  h2: 15,
  title: 15,
  headerTitle: 16,
  amount: 24,
  body: 13,
  rowLabel: 14,
  rowSub: 12,
  small: 12,
  tiny: 11,
  gridLabel: 11,
  button: 14,
  input: 15,
  eyebrow: 10.5,
  // kept for older references
  saldoLabel: 12,
  saldoAmount: 26,
  topNav: 16,
};

export const size = {
  header: 56,
  gutter: 16,
  cardRadius: 14,
  bannerRadius: 14,
  tile: 52,
  tileRadius: 14,
  tileGlyph: 30,
  gridColumns: 4,
  rowHeight: 58,
  rowImage: 38,
  button: 48,
  buttonRadius: 12,
  input: 48,
  inputRadius: 12,
  chip: 34,
  tabIcon: 22,
  dot: 6,
  quickIcon: 42,
  // legacy
  gridCircle: 52,
  gridIcon: 30,
};

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  float: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};

export const track = { tight: -0.4, eyebrow: 0.8 };
