import crypto from 'crypto';
import { InquiryResult } from 'pulsa-juan-common';

import { badRequest } from '../../lib/errors';
import type { FulfillmentProvider, PurchaseOutcome, PurchaseRequest } from './index';

// OtomaX H2H (our own OtomaX center; pulsa-juan is a reseller/H2H member in it).
//   request: GET {OTOMAX_URL}/trx?product&qty&dest&refID&memberID + (sign | pin&password)
//   reply:   "status=1&message=#235710 DY3.0856.. akan diproses @21:30. Saldo 100,000 - 8,500 = 91,500 * TRX Normal"
//            (older centers send the message alone)
//   report:  OtomaX calls /api/fulfillment/otomax/report?key=..&refid=..&status=20&price=8500&message=..
//            e.g. message "#235710 DY3.0856.. SUKSES. SN/Ref: 0431650003985923.. Saldo 100,000-8,500=91,500 @26/10 21:30:20"
// Message wording is configured per center, so the patterns are overridable via env.

export interface OtomaxConfig {
  url: string;
  memberId: string;
  pin: string;
  password: string;
  auth: 'sign' | 'plain';
  timeoutMs: number;
}

export function otomaxConfig(): OtomaxConfig | null {
  const url = (process.env.OTOMAX_URL ?? '').replace(/\/$/, '');
  const memberId = process.env.OTOMAX_MEMBER_ID ?? '';
  const pin = process.env.OTOMAX_PIN ?? '';
  const password = process.env.OTOMAX_PASSWORD ?? '';
  if (!url || !memberId || !pin || !password) return null;
  return {
    url,
    memberId,
    pin,
    password,
    auth: process.env.OTOMAX_AUTH === 'plain' ? 'plain' : 'sign',
    timeoutMs: Number(process.env.OTOMAX_TIMEOUT_MS) || 15000,
  };
}

const DEFAULT_SUCCESS_RE = /\b(sukses|berhasil|success)\b/i;
const DEFAULT_FAIL_RE =
  /\b(gagal|failed|salah|ditolak|gangguan|dibatalkan|batal|invalid|tidak (?:tersedia|aktif|valid|terdaftar|dikenal|sesuai|bisa|ditemukan)|saldo (?:tidak cukup|kurang)|stok (?:kosong|habis)|produk (?:kosong|habis|tidak))\b/i;
const DEFAULT_SN_RE = /\b(?:SN|S\/N|Token)(?:\s*\/\s*Ref)?\s*[:=.]?\s*([0-9A-Za-z][0-9A-Za-z/-]{3,})/i;

function envRe(name: string, fallback: RegExp) {
  const src = process.env[name];
  if (!src) return fallback;
  try {
    return new RegExp(src, 'i');
  } catch {
    console.error(`invalid ${name}, using default`);
    return fallback;
  }
}

export interface ParsedOtomaxMessage {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  serialNumber?: string;
}

/**
 * Classifies an OtomaX reply/report. Success and failure wording both present
 * (or neither, e.g. "akan diproses") → PENDING: an admin or a later report decides.
 */
export function parseOtomaxMessage(text: string): ParsedOtomaxMessage {
  const msg = (text ?? '').trim();
  const ok = envRe('OTOMAX_SUCCESS_RE', DEFAULT_SUCCESS_RE).test(msg);
  const failed = envRe('OTOMAX_FAIL_RE', DEFAULT_FAIL_RE).test(msg);
  if (failed && !ok) return { status: 'FAILED' };
  if (ok && !failed) {
    const sn = envRe('OTOMAX_SN_RE', DEFAULT_SN_RE).exec(msg)?.[1]?.replace(/[.,;]+$/, '');
    return { status: 'SUCCESS', ...(sn ? { serialNumber: sn } : {}) };
  }
  return { status: 'PENDING' };
}

/** The IP Center answers "status=<n>&message=<text>"; keep just the text. */
export function unwrapOtomaxReply(body: string) {
  const text = (body ?? '').trim();
  return /^status=\d*&message=([\s\S]*)$/.exec(text)?.[1].trim() ?? text;
}

/** url-safe base64(sha1("OtomaX|member|product|dest|refID|pin|password")) — check against the center's H2H setting. */
export function otomaxSign(cfg: OtomaxConfig, product: string, dest: string, refId: string) {
  const raw = ['OtomaX', cfg.memberId, product, dest, refId, cfg.pin, cfg.password].join('|');
  return crypto.createHash('sha1').update(raw).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function otomaxTrxUrl(cfg: OtomaxConfig, product: string, dest: string, refId: string) {
  const params = new URLSearchParams({ product, qty: '1', dest, refID: refId, memberID: cfg.memberId });
  if (cfg.auth === 'sign') params.set('sign', otomaxSign(cfg, product, dest, refId));
  else {
    params.set('pin', cfg.pin);
    params.set('password', cfg.password);
  }
  return `${cfg.url}/trx?${params.toString()}`;
}

/** One H2H request; returns the reply text. Throws on network errors, timeouts and non-2xx. */
export async function otomaxRequest(product: string, dest: string, refId: string): Promise<string> {
  const cfg = otomaxConfig();
  if (!cfg) throw new Error('OtomaX belum dikonfigurasi');
  const res = await fetch(otomaxTrxUrl(cfg, product, dest, refId), { signal: AbortSignal.timeout(cfg.timeoutMs) });
  const message = unwrapOtomaxReply(await res.text()).slice(0, 1000);
  if (!res.ok) throw new Error(`OtomaX HTTP ${res.status}: ${message.slice(0, 120)}`);
  return message;
}

/** refID of a bill check: OTOMAX_CHECK_REF_PREFIX (default "C") + BillCheck.number. */
export function checkRefPrefix() {
  return process.env.OTOMAX_CHECK_REF_PREFIX || 'C';
}

export class OtomaxProvider implements FulfillmentProvider {
  readonly name = 'otomax';
  readonly mode = 'AUTO' as const;

  async inquire(): Promise<InquiryResult> {
    throw badRequest('Cek tagihan via OtomaX belum tersedia', 'INQUIRY_UNAVAILABLE');
  }

  /** Throws on network errors/timeouts: the order stays PENDING and admins are alerted. */
  async purchase(req: PurchaseRequest): Promise<PurchaseOutcome> {
    const dest = req.phoneNumber ?? req.customerId;
    if (!req.productCode || !dest) throw new Error('Kode produk atau tujuan kosong');
    const message = await otomaxRequest(req.productCode, dest, String(req.trxNumber));
    const parsed = parseOtomaxMessage(message);
    if (parsed.status === 'FAILED') return { status: 'FAILED', reason: message, message };
    if (parsed.status === 'SUCCESS') return { status: 'SUCCESS', serialNumber: parsed.serialNumber, message };
    return { status: 'PENDING', message };
  }
}
