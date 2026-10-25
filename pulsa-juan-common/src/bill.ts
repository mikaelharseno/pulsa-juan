// Bill check (postpaid inquiry) replies from OtomaX are free text whose wording
// depends on the biller and the center, e.g.
//   "CEKPLN.532100123456 a/n BUDI SANTOSO, R1/1300VA, 1 Lbr (OKT26), Tag Rp 245.300, Admin Rp 2.500, Total Rp 247.800"
// Each Biller carries regex patterns (one capture group each) to read it. The same
// parser runs in the backend, the dashboard ("Tes pola") and the tests.

export interface BillerPatterns {
  nameRe?: string | null;
  amountRe?: string | null;
  adminRe?: string | null;
  totalRe?: string | null;
  periodeRe?: string | null;
  notPayableRe?: string | null;
  failRe?: string | null;
}

export type BillCheckStatus = 'PENDING' | 'READY' | 'NOT_PAYABLE' | 'FAILED' | 'USED' | 'EXPIRED';

export type BillParse =
  | { status: 'READY'; customerName?: string; periode?: string; amountDue: number; supplierAdmin: number; total?: number }
  | { status: 'NOT_PAYABLE'; reason: string }
  | { status: 'FAILED'; reason: string }
  | { status: 'PENDING' };

/** Defaults that read the common "a/n …, Tag Rp …, Admin Rp …, Total Rp …" wording. */
export const DEFAULT_BILL_PATTERNS: Required<{ [K in keyof BillerPatterns]: string }> = {
  nameRe: String.raw`\b(?:a\/n|an\.|nama\b\s*:?)\s*([^,;|]+?)\s*(?=[,;|]|$)`,
  amountRe: String.raw`\b(?:tag|tagihan|bill)\b\.?\s*:?\s*(?:rp\.?\s*)?([\d.,]+)`,
  adminRe: String.raw`\b(?:adm|admin|biaya admin)\b\.?\s*:?\s*(?:rp\.?\s*)?([\d.,]+)`,
  totalRe: String.raw`\btotal(?:\s+(?:bayar|tagihan))?\b\s*:?\s*(?:rp\.?\s*)?([\d.,]+)`,
  periodeRe: String.raw`(?:\bperiode\b\s*:?\s*([^,;|]+))|(\d+\s*(?:lbr|lembar|bln|bulan)\b[^,;|]*)`,
  notPayableRe: String.raw`\b(sudah lunas|lunas|tidak ada tagihan|belum ada tagihan|tagihan tidak ditemukan|sudah dibayar|sudah terbayar)\b`,
  failRe: String.raw`\b(gagal|salah|tidak ditemukan|tidak terdaftar|tidak valid|invalid|gangguan|ditolak|maaf|timeout)\b`,
};

/** "Rp 245.300" / "245,300" / "245.300,00" → 245300. */
export function rupiahFromText(s: string): number {
  const cleaned = s.trim().replace(/[.,]00$/, '');
  return Number(cleaned.replace(/[^\d]/g, '')) || 0;
}

function re(src: string | null | undefined, fallback: string) {
  const pattern = src && src.trim() ? src : fallback;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return new RegExp(fallback, 'i');
  }
}

/** First non-empty capture group of `pattern` in `text`. */
function capture(pattern: RegExp, text: string): string | undefined {
  const m = pattern.exec(text);
  if (!m) return undefined;
  return m.slice(1).find((g) => g !== undefined && g.trim() !== '')?.trim();
}

/**
 * Order matters: "already paid / no bill" wins (it often also says GAGAL), then a
 * readable bill amount means READY, then failure words, otherwise PENDING (e.g.
 * "akan diproses" — the bill arrives later through the report URL).
 */
export function parseBillMessage(patterns: BillerPatterns, text: string): BillParse {
  const msg = (text ?? '').replace(/\s+/g, ' ').trim();
  const p = { ...DEFAULT_BILL_PATTERNS };
  if (!msg) return { status: 'PENDING' };
  if (re(patterns.notPayableRe, p.notPayableRe).test(msg)) return { status: 'NOT_PAYABLE', reason: msg };

  const amountText = capture(re(patterns.amountRe, p.amountRe), msg);
  const amountDue = amountText ? rupiahFromText(amountText) : 0;
  if (amountDue > 0) {
    const adminText = capture(re(patterns.adminRe, p.adminRe), msg);
    const totalText = capture(re(patterns.totalRe, p.totalRe), msg);
    const total = totalText ? rupiahFromText(totalText) : undefined;
    const supplierAdmin = adminText ? rupiahFromText(adminText) : total && total > amountDue ? total - amountDue : 0;
    const customerName = capture(re(patterns.nameRe, p.nameRe), msg);
    const periode = capture(re(patterns.periodeRe, p.periodeRe), msg);
    return {
      status: 'READY',
      amountDue,
      supplierAdmin,
      ...(total ? { total } : {}),
      ...(customerName ? { customerName } : {}),
      ...(periode ? { periode } : {}),
    };
  }
  if (re(patterns.failRe, p.failRe).test(msg)) return { status: 'FAILED', reason: msg };
  return { status: 'PENDING' };
}

/** Realistic sample replies (until the center's real ones are configured) — used by tests, the fake center and the dashboard. */
export const SAMPLE_BILL_REPLIES = {
  PLN_POSTPAID: {
    ready: 'CEKPLN.532100123456 a/n BUDI SANTOSO, R1/1300VA, 1 Lbr (OKT26), Tag Rp 245.300, Admin Rp 2.500, Total Rp 247.800. @14:02',
    notPayable: 'CEKPLN.532100123450 GAGAL. Tagihan sudah lunas / belum ada tagihan',
    pending: 'R#C12 CEKPLN.532100123456 akan diproses @14:02',
    paid: 'T#55821 R#41 BYRPLN.532100123456 SUKSES. SN: 0BDS210Z4F2A7781C4D0. a/n BUDI SANTOSO Tag 245.300 Adm 2.500',
  },
  TELKOM: {
    ready: 'CEKTELKOM.0215551234 a/n PT CONTOH JAYA ABADI; Periode: OKT 2026; Tagihan: Rp 356.750; Admin: Rp 2.500; Total Bayar: Rp 359.250',
    notPayable: 'CEKTELKOM.0215551230 Tidak ada tagihan',
    pending: 'R#C13 CEKTELKOM.0215551234 akan diproses',
    paid: 'T#55822 R#42 BYRTELKOM.0215551234 SUKSES. SN: 7712009388231. Total Bayar 359.250',
  },
} as const;
