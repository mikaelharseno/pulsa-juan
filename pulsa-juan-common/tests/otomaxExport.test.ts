import { otomaxCategory, OTOMAX_GROUPS, planOtomaxImport, readOtomaxExport, validityDays } from '../src';

const HEADER = ['Aktif', 'Kode', 'Nama', 'Provider', 'Fisik', 'Tanpa Kode', 'Nominal', 'Hrg Beli', 'Hrg Jual', 'Kosong', 'Gangguan', 'Stok', 'Qty yg diijinkan', 'Filter Prefix Tujuan'];
const row = (aktif: string, kode: string, nama: string, provider: string, nominal: string, beli: string, jual: string, kosong = '0') =>
  [aktif, kode, nama, provider, '0', '0', nominal, beli, jual, kosong, '0', '0', '<null>', '<null>'];

// rows taken from our center's export of 2026-10-26
const SAMPLE = [
  HEADER,
  row('1', 'BYRPLN', ' Bayar', 'PPOB', '0', '-2100.0000', '-1900.0000'),
  row('1', 'DY3', 'ISAT DATA FREEDOM INTERNET 7GB/1 HARI', 'ID', '0', '8000.0000', '8500.0000'),
  row('1', 'IT2K', 'Obrol Seharian ke Semua Operator', 'ID', '0', '4500.0000', '5000.0000'),
  row('1', 'FIGH10', 'ISAT Freedom 5G 10GB (6GB + Kuota 5G 4GB)', 'ID', '0', '10000.0000', '10500.0000'),
  row('1', 'FI7', 'ISAT FREEDOM INTERNET 7GB 28 HARI', 'ID', '0', '35000.0000', '35500.0000'),
  row('1', 'IMA30', 'INDOSAT Tambah Masa Aktif 30 Hari', 'ID', '0', '14000.0000', '14900.0000'),
  row('1', 'I5', 'INDOSAT REGULER 5K', 'I', '5', '6750.0000', '6850.0000'),
  row('1', 'IH5', 'INDOSAT REGULER 5K', 'I', '5', '6750.0000', '6850.0000'),
  row('1', 'S5', 'TSel', 'S', '5', '5700.0000', '5900.0000'),
  row('1', 'S10', 'TSel', 'S', '10', '10350.0000', '10600.0000'),
  row('0', 'XH1', 'XL DATA HOTROD 1GB 2 HARI', 'XD', '0', '9000.0000', '9500.0000'),
  row('1', 'TDH4', 'THREE DATA HAPPY 7GB 5 HARI (HARIAN)', 'THD', '0', '15000.0000', '16000.0000', '1'),
  row('1', 'TV1', '(1rb isi 5)', 'VT', '1', '5600.0000', '5625.0000'),
  row('1', 'GRB10', 'SALDO GRAB / OVO 10K', 'GRAB', '10', '10000.0000', '10900.0000'),
];

describe('OtomaX product export', () => {
  const rows = readOtomaxExport(SAMPLE);

  it('reads the export', () => {
    expect(rows).toHaveLength(14);
    expect(rows.find((r) => r.code === 'DY3')).toMatchObject({ active: true, group: 'ID', hargaBeli: 8000, hargaJual: 8500, unavailable: false });
    expect(rows.find((r) => r.code === 'TDH4')?.unavailable).toBe(true);
    expect(() => readOtomaxExport([['KODE PRODUK', 'NAMA', 'harga']])).toThrow(/Bukan file ekspor/);
  });

  it('plans operator rows: dedupes, names, categories, skips', () => {
    const { rows: out, groups } = planOtomaxImport(rows);
    expect(out.map((r) => `${r.provider} ${r.sku} ${r.category} ${r.cost}`)).toEqual([
      'INDOSAT I5 Pulsa 6750',
      'INDOSAT DY3 Data Harian 8000',
      'INDOSAT FI7 Data Bulanan 35000',
      'INDOSAT FIGH10 5G 10000',
      'INDOSAT IT2K Telepon 4500',
      'INDOSAT IMA30 Masa Aktif 14000',
      'TELKOMSEL S5 Pulsa 5700',
      'TELKOMSEL S10 Pulsa 10350',
    ]);
    expect(out.find((r) => r.sku === 'S5')?.name).toBe('TSel 5K');
    const g = Object.fromEntries(groups.map((x) => [x.group, x]));
    expect(g.I.skipped).toEqual({ DUPLICATE: 1 });
    expect(g.XD.skipped).toEqual({ INACTIVE: 1 });
    expect(g.THD.skipped).toEqual({ UNAVAILABLE: 1 });
    expect(g.VT.skipped).toEqual({ EXCLUDED: 1 });
    expect(g.PPOB.skipped).toEqual({ UNSUPPORTED: 1 });
    expect(g.GRAB.mapping).toBeNull();
  });

  it('lets the admin switch groups on and off', () => {
    const { rows: out } = planOtomaxImport(rows, { VT: true, ID: false });
    expect(out.map((r) => r.sku)).toEqual(['I5', 'S5', 'S10', 'TV1']);
  });

  it('derives categories from names', () => {
    expect(validityDays('ISAT DATA FREEDOM INTERNET 7GB/1 H')).toBe(1);
    expect(validityDays('TRI 1GB+1GB 4G(7Hari)')).toBe(7);
    expect(validityDays('Tsel Data flash 1GB,30hr')).toBe(30);
    expect(validityDays('1GB(24Jam)+4GB(malam) 1 hari')).toBe(1);
    expect(validityDays('UNLIMITED JUMBO (90GB)')).toBeNull();
    expect(otomaxCategory(OTOMAX_GROUPS.ID, 'Booster HiFi Air 20GB')).toBe('HiFi Air');
    expect(otomaxCategory(OTOMAX_GROUPS.ID, 'ISAT SMS Ke Semua 30Hr')).toBe('SMS');
    expect(otomaxCategory(OTOMAX_GROUPS.ID, 'UNLIMITED JUMBO (90GB)')).toBe('Data');
    expect(otomaxCategory(OTOMAX_GROUPS.I, 'Isat SMS 300+100lain 7hr')).toBe('SMS');
    expect(otomaxCategory(OTOMAX_GROUPS.AON, 'THREE DATA AON 5 GB')).toBe('AON');
  });
});
