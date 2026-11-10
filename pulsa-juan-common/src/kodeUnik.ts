// 3-digit code added on top of a top-up amount so the incoming bank transfer
// can be matched to the order (100.000 → 100.123). Sequential with the order
// number (0–999), then stored on the TopUpOrder row (the backend probes forward
// with nextKodeUnik while another open top-up already uses the same total).
// The agent is credited the full transfer, kode unik included.
export function kodeUnikBase(orderNumber: number): number {
  return Math.abs(Math.trunc(orderNumber)) % 1000;
}

export function nextKodeUnik(code: number): number {
  return code >= 999 ? 0 : code + 1;
}

// QRIS: the top-up is paid to a static QRIS (no amount inside the code), so the
// agent still types the exact total with the kode unik. Amounts above
// QRIS_FEE_ABOVE pay a QRIS_FEE_PERCENT admin fee on top; the fee is not
// credited to saldo. Each static QRIS takes at most QRIS_MONTHLY_LIMIT a month.
export const QRIS_FEE_PERCENT = 1;
export const QRIS_FEE_ABOVE = 500_000;
export const QRIS_MONTHLY_LIMIT = 20_000_000;

export function qrisFee(amount: number): number {
  return amount > QRIS_FEE_ABOVE ? Math.ceil((amount * QRIS_FEE_PERCENT) / 100) : 0;
}
