import { Provider, PROVIDERS } from './tree/types';

// App tiles the Product Updater keeps in sync with imported products. Every
// imported package belongs to one tile; its category key starts with the tile
// key (INDOSAT_DATA_HARIAN, DANA_SALDO_DANA, ...). Operator tiles lock the phone
// number to the operator; the other tiles ask for what OtomaX needs as the
// destination (dest): a phone number, a PLN meter, a card number or a game id.

export type TileInput = 'OPERATOR_PHONE' | 'PHONE' | 'METER' | 'CARD' | 'GAME_ID' | 'GAME_ID_ZONE';

export interface ProductTile {
  /** category prefix; for operator tiles also the Package.provider */
  key: string;
  slug: string;
  label: string;
  /** short name in package list titles ("Indosat · Data Harian") */
  brand: string;
  icon: string;
  groupLabel: string;
  input: TileInput;
  /** label of the phone / id input */
  inputLabel: string;
  operator?: Provider;
}

const OPERATOR_LABEL: Record<Provider, string> = {
  TELKOMSEL: 'Telkomsel',
  XL: 'XL',
  AXIS: 'Axis',
  INDOSAT: 'Indosat',
  TRI: 'Tri',
  SMARTFREN: 'Smartfren',
};

const operatorTile = (p: Provider): ProductTile => ({
  key: p,
  slug: `paket-${p.toLowerCase()}`,
  label: `Paket ${OPERATOR_LABEL[p]}`,
  brand: OPERATOR_LABEL[p],
  icon: `builtin:${p.toLowerCase()}`,
  groupLabel: 'Pulsa & Data',
  input: 'OPERATOR_PHONE',
  inputLabel: `Nomor HP ${OPERATOR_LABEL[p]}`,
  operator: p,
});

const tile = (key: string, slug: string, label: string, icon: string, groupLabel: string, input: TileInput, inputLabel: string): ProductTile => ({
  key,
  slug,
  label,
  brand: label,
  icon: `builtin:${icon}`,
  groupLabel,
  input,
  inputLabel,
});

export const PRODUCT_TILES: Record<string, ProductTile> = {
  ...Object.fromEntries(PROVIDERS.map((p) => [p, operatorTile(p)])),
  PLN: tile('PLN', 'token-pln', 'Token PLN', 'token-pln', 'Tagihan', 'METER', 'Nomor Meter / ID Pelanggan'),
  GOPAY: tile('GOPAY', 'gopay', 'GoPay', 'gopay', 'E-Wallet', 'PHONE', 'Nomor HP GoPay'),
  DANA: tile('DANA', 'dana', 'DANA', 'dana', 'E-Wallet', 'PHONE', 'Nomor HP DANA'),
  OVO: tile('OVO', 'ovo', 'OVO', 'ovo', 'E-Wallet', 'PHONE', 'Nomor HP OVO'),
  LINKAJA: tile('LINKAJA', 'linkaja', 'LinkAja', 'linkaja', 'E-Wallet', 'PHONE', 'Nomor HP LinkAja'),
  SHOPEEPAY: tile('SHOPEEPAY', 'shopeepay', 'ShopeePay', 'shopeepay', 'E-Wallet', 'PHONE', 'Nomor HP ShopeePay'),
  GRAB: tile('GRAB', 'grab', 'Grab', 'ewallet', 'E-Wallet', 'PHONE', 'Nomor HP Grab'),
  ETOLL: tile('ETOLL', 'e-toll', 'E-Toll', 'emoney', 'E-Wallet', 'CARD', 'Nomor Kartu'),
  ML: tile('ML', 'mobile-legends', 'Mobile Legends', 'mobile-legends', 'Game', 'GAME_ID_ZONE', 'User ID'),
  FF: tile('FF', 'free-fire', 'Free Fire', 'free-fire', 'Game', 'GAME_ID', 'Player ID'),
  PUBG: tile('PUBG', 'pubg-mobile', 'PUBG Mobile', 'game', 'Game', 'GAME_ID', 'Player ID'),
  COD: tile('COD', 'call-of-duty', 'Call of Duty Mobile', 'game', 'Game', 'GAME_ID', 'Player ID (UID)'),
  GARENA: tile('GARENA', 'garena', 'Garena Shell', 'voucher', 'Voucher', 'PHONE', 'Nomor HP pembeli'),
  GAMESCOOL: tile('GAMESCOOL', 'gamescool', 'Gamescool', 'voucher', 'Voucher', 'PHONE', 'Nomor HP pembeli'),
  GPLAY: tile('GPLAY', 'google-play', 'Google Play', 'voucher', 'Voucher', 'PHONE', 'Nomor HP pembeli'),
  STEAM: tile('STEAM', 'steam', 'Steam Wallet', 'voucher', 'Voucher', 'PHONE', 'Nomor HP pembeli'),
  MTIX: tile('MTIX', 'mtix', 'M-Tix', 'voucher', 'Voucher', 'PHONE', 'Nomor HP akun M-Tix'),
};

export function productTile(key: string): ProductTile | null {
  return PRODUCT_TILES[key] ?? null;
}
