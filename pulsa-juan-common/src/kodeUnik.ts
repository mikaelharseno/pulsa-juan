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
