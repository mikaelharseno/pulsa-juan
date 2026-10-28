import { toInternationalMobile } from 'pulsa-juan-common';

import { escapeHtml, queueAdminAlert } from '../telegram.service';

// OTP delivery. Without otp.id configured the code is only logged. With
// OTPID_API_KEY set, purposes listed in OTPID_PURPOSES (default RESET_PIN) go
// out through otp.id: each channel in OTPID_CHANNELS in turn (default WhatsApp,
// then SMS); otp.id charges nothing for a failed send. Other purposes stay on
// the console, so sign-up costs nothing. Tests swap the sender with setOtpSender.

export interface OtpSender {
  send(phone: string, code: string, purpose: string): Promise<void>;
}

/** Every channel failed; requestOtp turns this into a 502 for the app. */
export class OtpDeliveryError extends Error {}

export class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string, purpose: string) {
    console.log(`[otp] ${purpose} ${phone}: ${code}`);
  }
}

const TIMEOUT_MS = 10_000;

export interface OtpIdOptions {
  apiKey: string;
  baseUrl?: string;
  brand?: string;
  channels?: string[];
  ttlSeconds?: number;
}

interface OtpIdReply {
  success?: boolean;
  data?: { status?: string; failure?: { code?: string; message?: string } };
  error?: { code?: string; message?: string } | null;
}

export class OtpIdSender implements OtpSender {
  constructor(private opts: OtpIdOptions) {}

  async send(phone: string, code: string, purpose: string) {
    const destination = toInternationalMobile(phone);
    const failures: string[] = [];
    for (const channel of this.opts.channels ?? ['whatsapp', 'sms']) {
      try {
        const res = await fetch(`${(this.opts.baseUrl ?? 'https://api.otp.id').replace(/\/$/, '')}/v3/send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ channel, destination, otp: code, brand: this.opts.brand ?? 'Pulsa Juan', ttl: this.opts.ttlSeconds ?? 300 }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const reply = (await res.json().catch(() => ({}))) as OtpIdReply;
        if (res.ok && reply.success && reply.data?.status !== 'failed') return;
        failures.push(`${channel}: ${reply.data?.failure?.code ?? reply.error?.code ?? `HTTP ${res.status}`}`);
      } catch (error) {
        failures.push(`${channel}: ${(error as Error).message}`);
      }
    }
    const summary = failures.join(', ');
    console.error(`[otp] otp.id failed for ${purpose} ${phone}: ${summary}`);
    queueAdminAlert(`⚠️ <b>OTP tidak terkirim</b> (${escapeHtml(purpose)}) ke ${escapeHtml(phone)}\n${escapeHtml(summary)}`);
    throw new OtpDeliveryError(summary);
  }
}

/** Sends the listed purposes through `primary`, everything else through `rest`. */
export class PurposeRouter implements OtpSender {
  constructor(private purposes: string[], private primary: OtpSender, private rest: OtpSender) {}

  send(phone: string, code: string, purpose: string) {
    return (this.purposes.includes(purpose) ? this.primary : this.rest).send(phone, code, purpose);
  }
}

const list = (v: string | undefined, fallback: string[]) => {
  const items = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : fallback;
};

export function senderFromEnv(env = process.env): OtpSender {
  const log = new ConsoleOtpSender();
  if (!env.OTPID_API_KEY) return log;
  const otpId = new OtpIdSender({
    apiKey: env.OTPID_API_KEY,
    baseUrl: env.OTPID_URL,
    brand: env.OTPID_BRAND,
    channels: list(env.OTPID_CHANNELS, ['whatsapp', 'sms']),
  });
  return new PurposeRouter(list(env.OTPID_PURPOSES, ['RESET_PIN']), otpId, log);
}

let sender: OtpSender | null = null;

export function getOtpSender(): OtpSender {
  return (sender ??= senderFromEnv());
}

export function setOtpSender(s: OtpSender | null) {
  sender = s;
}

/** Which purposes go out for real; shown on the dashboard Integrasi card. */
export function otpDeliveryStatus(env = process.env) {
  return env.OTPID_API_KEY
    ? { provider: 'otp.id', purposes: list(env.OTPID_PURPOSES, ['RESET_PIN']), channels: list(env.OTPID_CHANNELS, ['whatsapp', 'sms']) }
    : { provider: null, purposes: [] as string[], channels: [] as string[] };
}
