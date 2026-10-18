// Manual thousands separator: Hermes/Android Intl support is patchy, so no
// toLocaleString('id-ID').
export function formatNumberId(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatRp(n: number): string {
  return 'Rp ' + formatNumberId(n);
}

/** "100.000" or "Rp 100.000" → 100000 */
export function parseRp(input: string): number {
  const digits = (input ?? '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
