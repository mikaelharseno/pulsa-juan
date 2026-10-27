import { isMarketExport, otomaxCategory, OTOMAX_GROUPS, planOtomaxImport, readOtomaxExport, validityDays } from '../src';

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

const OTHER_GROUPS = [
  HEADER,
  row('1', 'PLN20', 'PLN', 'PLN', '20', '20644.0000', '21600.0000'),
  row('1', 'SG10', 'GOPAY KONSUMEN 10K', 'GOPAY', '10', '10650.0000', '10700.0000'),
  row('1', 'TGD20', 'GOJEK DRIVER 20K', 'GOPAY', '20', '20500.0000', '20600.0000'),
  row('1', 'ETBNI10', 'ETOLL TAPCASH BNI 10K', 'E', '10', '11650.0000', '11700.0000'),
  row('1', 'ETOLL25', 'E-money mandiri 25K', 'E', '25', '25600.0000', '25700.0000'),
  row('1', 'VML15', 'ML 15 Diamod', 'VML', '15', '4675.0000', '4700.0000'),
  row('1', 'VMLS1', 'Starlight 30hr + 127 Diamond', 'VML', '1', '196550.0000', '197000.0000'),
  row('1', 'VSTID12', 'Steam Wallet Code', 'VSTID', '12', '15500.0000', '15600.0000'),
  row('1', 'VSTID45', 'Steam Wallet Code', 'VSTID', '45', '53000.0000', '53100.0000'),
  row('1', 'CEKPLN', ' Tag PLN', 'PPOB', '0', '0.0000', '0.0000'),
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
      'null GRB10 Grab / OVO 10000',
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
    expect(g.GRAB.mapping).toMatchObject({ tile: 'GRAB' });
  });

  it('lets the admin switch groups on and off', () => {
    const { rows: out } = planOtomaxImport(rows, { VT: true, ID: false });
    expect(out.map((r) => r.sku)).toEqual(['GRB10', 'I5', 'S5', 'S10', 'TV1']);
  });

  it('puts e-wallet, PLN, e-toll, game and voucher groups in their own tiles', () => {
    const { rows: out, groups } = planOtomaxImport(readOtomaxExport(OTHER_GROUPS));
    expect(out.map((r) => `${r.tile} ${r.provider} ${r.sku} ${r.category} ${r.name}`)).toEqual([
      'ETOLL null ETBNI10 Tapcash BNI ETOLL TAPCASH BNI 10K',
      'ETOLL null ETOLL25 E-Money Mandiri E-money mandiri 25K',
      'GOPAY null SG10 GoPay GOPAY KONSUMEN 10K',
      'GOPAY null TGD20 GoPay Driver GOJEK DRIVER 20K',
      'ML null VML15 Diamond ML 15 Diamod',
      'ML null VMLS1 Starlight Starlight 30hr + 127 Diamond',
      'PLN null PLN20 Token PLN PLN',
      // same name at different prices → nominal appended
      'STEAM null VSTID12 Wallet Code Steam Wallet Code 12K',
      'STEAM null VSTID45 Wallet Code Steam Wallet Code 45K',
    ]);
    // bills are checked/paid through billers, not sold as packages
    expect(groups.find((g) => g.group === 'PPOB')?.skipped).toEqual({ UNSUPPORTED: 1 });
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

describe('market files in the export layout', () => {
  const MARKET = [
    ['Aktif', 'Kode', 'Nama', 'Provider', 'Kategori', 'Nominal', 'Hrg Beli', 'Hrg Jual', 'Kosong', 'Gangguan', 'Sumber Harga'],
    ['1', 'XDH3', '3GB Full 24 Jam 30 Hari', 'XL', 'XL Data All jaringan 24 Jam 30 Hari', '0', '24450', '24450', '0', '0', 'topupkuota (XDH3)'],
    ['1', 'X10', 'Xl 10.000', 'XL', 'Pulsa', '10', '10944', '10944', '0', '0', 'okekios (X10)'],
    ['1', 'XDH1', '1GB Full 24 Jam 30 Hari', 'XL', 'XL Data All jaringan 24 Jam 30 Hari', '0', '14000', '14000', '0', '0', 'topupkuota (XDH1)'],
  ];

  it('is recognised and keeps its own categories and row order (Pulsa first)', () => {
    expect(isMarketExport(MARKET[0])).toBe(true);
    expect(isMarketExport(SAMPLE[0])).toBe(false);
    const { rows: out, groups } = planOtomaxImport(readOtomaxExport(MARKET));
    expect(out.map((r) => `${r.sku} ${r.category} ${r.cost}`)).toEqual([
      'X10 Pulsa 10944',
      'XDH3 XL Data All jaringan 24 Jam 30 Hari 24450',
      'XDH1 XL Data All jaringan 24 Jam 30 Hari 14000',
    ]);
    expect(groups[0]).toMatchObject({ group: 'XL', imported: 3, mapping: { tile: 'XL' } });
  });
});
