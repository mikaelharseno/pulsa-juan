// 3-digit code added on top of a top-up amount so the incoming bank transfer
// can be matched to the order (100.000 → 100.321). Derived from the order
// number, then stored on the TopUpOrder row (the backend probes forward with
// nextKodeUnik while another open top-up already uses the same total).
export function kodeUnikBase(orderNumber: number): number {
  return 100 + (Math.abs(Math.trunc(orderNumber)) % 900);
}

export function nextKodeUnik(code: number): number {
  return code >= 999 ? 100 : code + 1;
}
