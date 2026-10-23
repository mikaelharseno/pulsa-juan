import { isValidNik, isValidPin } from '../src/pin';
import { statusMeta } from '../src/status';

describe('pin / nik', () => {
  it('accepts 6-digit non-trivial pins', () => {
    expect(isValidPin('482915')).toBe(true);
    expect(isValidPin('112233')).toBe(true);
  });
  it('rejects wrong length, non-digits, repeats and runs', () => {
    for (const p of ['', '12345', '1234567', '12a456', '000000', '777777', '123456', '654321', '345678']) {
      expect(isValidPin(p)).toBe(false);
    }
  });
  it('validates NIK as 16 digits', () => {
    expect(isValidNik('3171234567890001')).toBe(true);
    expect(isValidNik('317123456789000')).toBe(false);
    expect(isValidNik('31712345678900a1')).toBe(false);
  });
});

describe('statusMeta', () => {
  it('uses agent wording when asked', () => {
    expect(statusMeta('PENDING').label).toBe('Menunggu');
    expect(statusMeta('PENDING', 'agent').label).toBe('Diproses');
    expect(statusMeta('REFUNDED', 'agent').label).toBe('Direfund');
    expect(statusMeta('WHATEVER').label).toBe('WHATEVER');
  });
});
