import { detectProvider, isValidIndoMobile, normalizeIndonesianMobile, toInternationalMobile } from '../src/phone';
import { formatRp, parseRp } from '../src/formatRp';
import { kodeUnikBase, nextKodeUnik } from '../src/kodeUnik';

describe('phone helpers', () => {
  it('normalises +62 / 62 / 8 prefixes to 08', () => {
    expect(normalizeIndonesianMobile('+62 812-3456-7890')).toBe('081234567890');
    expect(normalizeIndonesianMobile('6281234567890')).toBe('081234567890');
    expect(normalizeIndonesianMobile('81234567890')).toBe('081234567890');
    expect(normalizeIndonesianMobile('081234567890')).toBe('081234567890');
  });
  it('validates length', () => {
    expect(isValidIndoMobile('0812345678')).toBe(true);
    expect(isValidIndoMobile('081234567')).toBe(false);
    expect(isValidIndoMobile('08123456789012')).toBe(false);
    expect(isValidIndoMobile('0212345678')).toBe(false);
  });
  it('detects providers', () => {
    expect(detectProvider('081234567890')).toBe('TELKOMSEL');
    expect(detectProvider('087812345678')).toBe('XL');
    expect(detectProvider('083812345678')).toBe('AXIS');
    expect(detectProvider('085712345678')).toBe('INDOSAT');
    expect(detectProvider('089912345678')).toBe('TRI');
    expect(detectProvider('088112345678')).toBe('SMARTFREN');
    expect(detectProvider('080012345678')).toBeNull();
  });
  it('international form', () => {
    expect(toInternationalMobile('0812-3456')).toBe('628123456');
    expect(toInternationalMobile('+62812')).toBe('62812');
  });
});

describe('formatRp / kodeUnik', () => {
  it('formats with dots', () => {
    expect(formatRp(100321)).toBe('Rp 100.321');
    expect(formatRp(0)).toBe('Rp 0');
    expect(parseRp('Rp 1.500.000')).toBe(1500000);
  });
  it('kode unik stays in 100..999', () => {
    expect(kodeUnikBase(1)).toBe(101);
    expect(kodeUnikBase(900)).toBe(100);
    expect(kodeUnikBase(1799)).toBe(999);
    expect(nextKodeUnik(999)).toBe(100);
    expect(nextKodeUnik(321)).toBe(322);
  });
});
