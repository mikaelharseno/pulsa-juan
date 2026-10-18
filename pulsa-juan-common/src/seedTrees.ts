import { SegmentTree } from './tree/types';

// Example segments covering every node type. Shared by the backend seed and
// the walker tests so a broken example fails loudly in both places.

export interface SeedSegment {
  slug: string;
  label: string;
  groupLabel: string;
  sortOrder: number;
  isActive: boolean;
  tree: SegmentTree;
}

const pulsaBranches: Record<string, string> = {
  TELKOMSEL: 'PULSA_TELKOMSEL',
  XL: 'PULSA_XL',
  AXIS: 'PULSA_AXIS',
  INDOSAT: 'PULSA_INDOSAT',
  TRI: 'PULSA_TRI',
  SMARTFREN: 'PULSA_SMARTFREN',
};

export const SEED_SEGMENTS: SeedSegment[] = [
  {
    slug: 'pulsa',
    label: 'Pulsa',
    groupLabel: 'Pulsa & Data',
    sortOrder: 1,
    isActive: true,
    tree: {
      schemaVersion: 1,
      rootId: 'phone',
      nodes: {
        phone: {
          id: 'phone',
          type: 'PhoneNumberInput',
          title: 'Isi Pulsa',
          label: 'Nomor HP',
          allowedProviders: null,
          branches: Object.fromEntries(Object.keys(pulsaBranches).map((p) => [p, 'pk_' + p.toLowerCase()])),
          defaultChildId: null,
        },
        ...Object.fromEntries(
          Object.entries(pulsaBranches).map(([p, category]) => [
            'pk_' + p.toLowerCase(),
            {
              id: 'pk_' + p.toLowerCase(),
              type: 'PackagesList',
              title: 'Pilih Nominal ' + p.charAt(0) + p.slice(1).toLowerCase(),
              source: { kind: 'CATEGORY', category },
              nextId: null,
            },
          ]),
        ),
      },
    },
  },
  {
    slug: 'xl',
    label: 'XL',
    groupLabel: 'Pulsa & Data',
    sortOrder: 2,
    isActive: true,
    tree: {
      schemaVersion: 1,
      rootId: 'phone',
      nodes: {
        phone: { id: 'phone', type: 'PhoneNumberInput', title: 'Pulsa XL', label: 'Nomor HP XL', allowedProviders: ['XL'], branches: {}, defaultChildId: 'pk' },
        pk: { id: 'pk', type: 'PackagesList', title: 'Pilih Nominal XL', source: { kind: 'CATEGORY', category: 'PULSA_XL' }, nextId: null },
      },
    },
  },
  {
    slug: 'telkomsel',
    label: 'Telkomsel',
    groupLabel: 'Pulsa & Data',
    sortOrder: 3,
    isActive: true,
    tree: {
      schemaVersion: 1,
      rootId: 'phone',
      nodes: {
        phone: { id: 'phone', type: 'PhoneNumberInput', title: 'Pulsa Telkomsel', label: 'Nomor HP Telkomsel', allowedProviders: ['TELKOMSEL'], branches: {}, defaultChildId: 'pk' },
        pk: { id: 'pk', type: 'PackagesList', title: 'Pilih Nominal Telkomsel', source: { kind: 'CATEGORY', category: 'PULSA_TELKOMSEL' }, nextId: null },
      },
    },
  },
  {
    slug: 'paket-data',
    label: 'Paket Data',
    groupLabel: 'Pulsa & Data',
    sortOrder: 4,
    isActive: true,
    tree: {
      schemaVersion: 1,
      rootId: 'phone',
      nodes: {
        phone: {
          id: 'phone',
          type: 'PhoneNumberInput',
          title: 'Paket Data',
          label: 'Nomor HP',
          allowedProviders: ['TELKOMSEL', 'XL'],
          branches: { TELKOMSEL: 'data_tsel', XL: 'data_xl' },
          defaultChildId: null,
        },
        data_tsel: { id: 'data_tsel', type: 'PackagesList', title: 'Paket Data Telkomsel', source: { kind: 'CATEGORY', category: 'DATA_TELKOMSEL' }, nextId: null },
        data_xl: { id: 'data_xl', type: 'PackagesList', title: 'Paket Data XL', source: { kind: 'CATEGORY', category: 'DATA_XL' }, nextId: null },
      },
    },
  },
  {
    slug: 'token-pln',
    label: 'Token PLN',
    groupLabel: 'Tagihan',
    sortOrder: 5,
    isActive: true,
    tree: {
      schemaVersion: 1,
      rootId: 'meter',
      nodes: {
        meter: {
          id: 'meter',
          type: 'CustomerIdInput',
          title: 'Token Listrik PLN',
          fields: [
            { key: 'customerId', label: 'Nomor Meter / ID Pelanggan', placeholder: '11–12 digit', regex: '^[0-9]{11,12}$', minLength: 11, maxLength: 12, keyboard: 'numeric', required: true },
          ],
          nextId: 'pk',
        },
        pk: { id: 'pk', type: 'PackagesList', title: 'Pilih Nominal Token', source: { kind: 'CATEGORY', category: 'PLN_PREPAID' }, nextId: null },
      },
    },
  },
  {
    slug: 'pln-pascabayar',
    label: 'PLN Pascabayar',
    groupLabel: 'Tagihan',
    sortOrder: 6,
    isActive: false, // inquiry is a stub in v1
    tree: {
      schemaVersion: 1,
      rootId: 'idpel',
      nodes: {
        idpel: {
          id: 'idpel',
          type: 'CustomerIdInput',
          title: 'PLN Pascabayar',
          fields: [{ key: 'customerId', label: 'ID Pelanggan', placeholder: '12 digit', regex: '^[0-9]{12}$', minLength: 12, maxLength: 12, keyboard: 'numeric', required: true }],
          nextId: 'inquiry',
        },
        inquiry: { id: 'inquiry', type: 'BillInquiry', title: 'Tagihan Listrik', product: 'PLN_POSTPAID', adminFee: 2500, nextId: null },
      },
    },
  },
  {
    slug: 'gopay',
    label: 'Gopay',
    groupLabel: 'E-Wallet',
    sortOrder: 7,
    isActive: true,
    tree: {
      schemaVersion: 1,
      rootId: 'jenis',
      nodes: {
        jenis: {
          id: 'jenis',
          type: 'ListNode',
          title: 'Pilih Layanan',
          rows: [
            { id: 'customer', label: 'Top Up Gopay Customer', childId: 'phone_c', isActive: true },
            { id: 'driver', label: 'Top Up Gopay Driver', childId: 'phone_d', isActive: true },
          ],
        },
        phone_c: { id: 'phone_c', type: 'PhoneNumberInput', title: 'Gopay Customer', label: 'Nomor HP Gopay', allowedProviders: null, branches: {}, defaultChildId: 'amount_c' },
        phone_d: { id: 'phone_d', type: 'PhoneNumberInput', title: 'Gopay Driver', label: 'Nomor HP Driver', allowedProviders: null, branches: {}, defaultChildId: 'amount_d' },
        amount_c: { id: 'amount_c', type: 'EnterAmount', title: 'Nominal Top Up', label: 'Nominal Top Up', min: 10000, max: 2000000, step: 1000, quickAmounts: [20000, 50000, 100000, 200000], adminFee: 1500, nextId: null },
        amount_d: { id: 'amount_d', type: 'EnterAmount', title: 'Nominal Top Up', label: 'Nominal Top Up', min: 10000, max: 2000000, step: 1000, quickAmounts: [20000, 50000, 100000, 200000], adminFee: 1500, nextId: null },
      },
    },
  },
  {
    slug: 'mobile-legends',
    label: 'Mobile Legends',
    groupLabel: 'Game',
    sortOrder: 8,
    isActive: true,
    tree: {
      schemaVersion: 1,
      rootId: 'ids',
      nodes: {
        ids: {
          id: 'ids',
          type: 'CustomerIdInput',
          title: 'Mobile Legends',
          fields: [
            { key: 'customerId', label: 'User ID', placeholder: 'contoh: 12345678', regex: '^[0-9]{6,12}$', keyboard: 'numeric', required: true },
            { key: 'secondaryId', label: 'Zone ID', placeholder: 'contoh: 1234', regex: '^[0-9]{3,6}$', keyboard: 'numeric', required: true },
          ],
          nextId: 'pk',
        },
        pk: { id: 'pk', type: 'PackagesList', title: 'Pilih Diamond', source: { kind: 'CATEGORY', category: 'GAME_ML' }, nextId: null },
      },
    },
  },
];

export interface SeedPackage {
  code: string;
  name: string;
  category: string;
  provider?: string;
  hargaAgen: number;
  hargaBeli: number;
  sortOrder: number;
}

function pulsa(category: string, provider: string, prefix: string, denoms: number[], margin: number): SeedPackage[] {
  return denoms.map((d, i) => ({
    code: `${prefix}_${d / 1000}K`,
    name: `${provider.charAt(0) + provider.slice(1).toLowerCase()} ${d.toLocaleString('en-US').replace(/,/g, '.')}`,
    category,
    provider,
    hargaAgen: d + margin,
    hargaBeli: d + Math.round(margin / 2),
    sortOrder: i,
  }));
}

export const SEED_PACKAGES: SeedPackage[] = [
  ...pulsa('PULSA_TELKOMSEL', 'TELKOMSEL', 'TSEL', [5000, 10000, 20000, 50000, 100000], 1500),
  ...pulsa('PULSA_XL', 'XL', 'XL', [5000, 10000, 25000, 50000, 100000], 1300),
  ...pulsa('PULSA_INDOSAT', 'INDOSAT', 'ISAT', [5000, 10000, 25000, 50000, 100000], 1300),
  ...pulsa('PULSA_TRI', 'TRI', 'TRI', [5000, 10000, 20000, 50000, 100000], 1200),
  ...pulsa('PULSA_AXIS', 'AXIS', 'AXIS', [5000, 10000, 25000, 50000, 100000], 1200),
  ...pulsa('PULSA_SMARTFREN', 'SMARTFREN', 'SF', [5000, 10000, 20000, 50000, 100000], 1200),
  { code: 'TSEL_DATA_1GB', name: 'Telkomsel Data 1GB / 7 hari', category: 'DATA_TELKOMSEL', provider: 'TELKOMSEL', hargaAgen: 16000, hargaBeli: 15000, sortOrder: 0 },
  { code: 'TSEL_DATA_3GB', name: 'Telkomsel Data 3GB / 30 hari', category: 'DATA_TELKOMSEL', provider: 'TELKOMSEL', hargaAgen: 36000, hargaBeli: 34500, sortOrder: 1 },
  { code: 'TSEL_DATA_8GB', name: 'Telkomsel Data 8GB / 30 hari', category: 'DATA_TELKOMSEL', provider: 'TELKOMSEL', hargaAgen: 62000, hargaBeli: 60000, sortOrder: 2 },
  { code: 'XL_DATA_2GB', name: 'XL Data 2GB / 30 hari', category: 'DATA_XL', provider: 'XL', hargaAgen: 22000, hargaBeli: 21000, sortOrder: 0 },
  { code: 'XL_DATA_5GB', name: 'XL Data 5GB / 30 hari', category: 'DATA_XL', provider: 'XL', hargaAgen: 45000, hargaBeli: 43500, sortOrder: 1 },
  { code: 'PLN_20K', name: 'Token PLN 20.000', category: 'PLN_PREPAID', hargaAgen: 22000, hargaBeli: 21000, sortOrder: 0 },
  { code: 'PLN_50K', name: 'Token PLN 50.000', category: 'PLN_PREPAID', hargaAgen: 52000, hargaBeli: 51000, sortOrder: 1 },
  { code: 'PLN_100K', name: 'Token PLN 100.000', category: 'PLN_PREPAID', hargaAgen: 102000, hargaBeli: 101000, sortOrder: 2 },
  { code: 'PLN_200K', name: 'Token PLN 200.000', category: 'PLN_PREPAID', hargaAgen: 202000, hargaBeli: 201000, sortOrder: 3 },
  { code: 'ML_86', name: '86 Diamonds', category: 'GAME_ML', hargaAgen: 24000, hargaBeli: 22500, sortOrder: 0 },
  { code: 'ML_172', name: '172 Diamonds', category: 'GAME_ML', hargaAgen: 47000, hargaBeli: 45000, sortOrder: 1 },
  { code: 'ML_257', name: '257 Diamonds', category: 'GAME_ML', hargaAgen: 70000, hargaBeli: 67500, sortOrder: 2 },
];
