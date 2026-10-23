// 6-digit transaction/login PIN. Rejects all-same digits and straight runs
// (000000, 123456, 654321) which are the first guesses of anyone holding the phone.
export const PIN_LENGTH = 6;

export function isValidPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin ?? '')) return false;
  const d = pin.split('').map(Number);
  const steps = d.slice(1).map((v, i) => v - d[i]);
  if (steps.every((s) => s === 0)) return false;
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return false;
  return true;
}

/** 16-digit NIK (Nomor Induk Kependudukan). */
export function isValidNik(nik: string): boolean {
  return /^\d{16}$/.test(nik ?? '');
}
