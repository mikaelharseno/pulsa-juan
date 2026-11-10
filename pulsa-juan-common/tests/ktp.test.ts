import { digitsFromOcr, isPlausibleNik, parseKtpText } from '../src/ktp';

describe('NIK plausibility', () => {
  it('needs a province code, a birth day (women +40) and a month', () => {
    expect(isPlausibleNik('3273021505900001')).toBe(true); // Kota Bandung, 15 May 1990
    expect(isPlausibleNik('3273025505900001')).toBe(true); // woman: day 55 → 15
    expect(isPlausibleNik('9973021505900001')).toBe(false); // no province 99
    expect(isPlausibleNik('3273023205900001')).toBe(false); // day 32
    expect(isPlausibleNik('3273021513900001')).toBe(false); // month 13
    expect(isPlausibleNik('327302150590000')).toBe(false);
  });

  it('maps OCR look-alikes back to digits', () => {
    expect(digitsFromOcr('3273O2I5O59OOOOI')).toBe('3273021505900001');
    expect(digitsFromOcr('32 73')).toBe('3273');
  });
});

describe('reading a KTP', () => {
  it('finds NIK and name on a typical OCR of an e-KTP', () => {
    const text = [
      'PROVINSI JAWA BARAT',
      'KOTA BANDUNG',
      'NIK : 3273O2I5O59OOOOI',
      'Nama : BUDI SANTOSO',
      'Tempat/Tgl Lahir : BANDUNG, 15-05-1990',
      'Jenis Kelamin : LAKI-LAKI',
    ].join('\n');
    expect(parseKtpText(text)).toEqual({ nik: '3273021505900001', name: 'BUDI SANTOSO' });
  });

  it('handles labels on their own line and stray characters', () => {
    const text = ['N I K', '3273025505900001', 'Nama', 'SITI  AMINAH,', 'Tempat/Tgl Lahir', 'BANDUNG'].join('\n');
    expect(parseKtpText(text)).toEqual({ nik: '3273025505900001', name: 'SITI AMINAH' });
  });

  it('returns nulls when it cannot read them', () => {
    expect(parseKtpText('foto buram')).toEqual({ nik: null, name: null });
    expect(parseKtpText('NIK : 1234')).toEqual({ nik: null, name: null });
  });
});
