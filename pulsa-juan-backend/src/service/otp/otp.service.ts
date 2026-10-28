import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { isValidIndoMobile, normalizeIndonesianMobile } from 'pulsa-juan-common';
import { z } from 'zod';

import { OtpPurpose } from '../../../prisma/generated';
import { prisma } from '../../../prisma/client';
import { badRequest, conflict, HttpError, notFound, tooManyRequests } from '../../lib/errors';
import { getOtpSender, OtpDeliveryError } from './sender';

// OTP flow: request → verify → short-lived otpTicket (JWT) that register /
// reset-PIN / change-phone accept as proof the caller owns the phone.
// REGISTER and VERIFY_PHONE target a phone with no agent yet, so their code
// lives in PhoneVerification; RESET_PIN lives on Agent.confirmationCode*.

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const TICKET_TTL = '10m';

const purposeSchema = z.enum(['REGISTER', 'RESET_PIN', 'VERIFY_PHONE']);

export const otpRequestSchema = z.object({
  phone: z.string().trim().min(8).max(20),
  purpose: purposeSchema,
});

export const otpVerifySchema = z.object({
  phone: z.string().trim().min(8).max(20),
  purpose: purposeSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Kode OTP 6 angka'),
});

interface OtpTicketClaims {
  kind: 'otp';
  phone: string;
  purpose: OtpPurpose;
}

export function normalizePhoneOrThrow(input: string) {
  const phone = normalizeIndonesianMobile(input);
  if (!isValidIndoMobile(phone)) throw badRequest('Nomor HP tidak valid');
  return phone;
}

interface Slot {
  codeHash: string | null;
  purpose: OtpPurpose | null;
  expiresAt: Date | null;
  attempts: number;
  sentAt: Date | null;
}

async function loadSlot(phone: string, purpose: OtpPurpose): Promise<{ slot: Slot | null; agentId: string | null }> {
  if (purpose === 'RESET_PIN') {
    const agent = await prisma.agent.findUnique({ where: { phone } });
    if (!agent) return { slot: null, agentId: null };
    return {
      agentId: agent.id,
      slot: {
        codeHash: agent.confirmationCode,
        purpose: agent.confirmationCodePurpose,
        expiresAt: agent.confirmationCodeExpiresAt,
        attempts: agent.confirmationCodeAttempts,
        sentAt: agent.confirmationCodeSentAt,
      },
    };
  }
  const row = await prisma.phoneVerification.findUnique({ where: { phone } });
  return {
    agentId: null,
    slot: row ? { codeHash: row.codeHash, purpose: row.purpose, expiresAt: row.expiresAt, attempts: row.attempts, sentAt: row.sentAt } : null,
  };
}

export async function requestOtp(input: z.infer<typeof otpRequestSchema>) {
  const phone = normalizePhoneOrThrow(input.phone);
  const purpose = input.purpose as OtpPurpose;
  const registered = await prisma.agent.findUnique({ where: { phone }, select: { id: true } });
  if (purpose === 'RESET_PIN' && !registered) throw notFound('Nomor HP belum terdaftar');
  if (purpose !== 'RESET_PIN' && registered) throw conflict('Nomor HP sudah terdaftar', 'PHONE_TAKEN');

  const { slot } = await loadSlot(phone, purpose);
  const now = Date.now();
  if (slot?.sentAt && now - slot.sentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - slot.sentAt.getTime())) / 1000);
    throw tooManyRequests(`Tunggu ${retryAfter} detik sebelum meminta kode baru`, 'OTP_COOLDOWN', { retryAfter });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(now + OTP_TTL_MS);
  const sentAt = new Date(now);
  if (purpose === 'RESET_PIN') {
    await prisma.agent.update({
      where: { phone },
      data: {
        confirmationCode: codeHash,
        confirmationCodePurpose: purpose,
        confirmationCodeExpiresAt: expiresAt,
        confirmationCodeAttempts: 0,
        confirmationCodeSentAt: sentAt,
      },
    });
  } else {
    await prisma.phoneVerification.upsert({
      where: { phone },
      create: { phone, codeHash, purpose, expiresAt, sentAt },
      update: { codeHash, purpose, expiresAt, sentAt, attempts: 0 },
    });
  }
  try {
    await getOtpSender().send(phone, code, purpose);
  } catch (error) {
    if (!(error instanceof OtpDeliveryError)) throw error;
    // nothing went out: lift the resend cooldown so the agent can retry now
    if (purpose === 'RESET_PIN') await prisma.agent.update({ where: { phone }, data: { confirmationCodeSentAt: new Date(0) } });
    else await prisma.phoneVerification.update({ where: { phone }, data: { sentAt: new Date(0) } });
    throw new HttpError(502, 'Kode OTP gagal dikirim. Coba lagi sebentar lagi atau hubungi CS.', 'OTP_SEND_FAILED');
  }
  return {
    phone,
    purpose,
    expiresAt,
    resendAfter: OTP_RESEND_COOLDOWN_MS / 1000,
    ...(process.env.OTP_DEBUG === '1' ? { debugCode: code } : {}),
  };
}

export async function verifyOtp(input: z.infer<typeof otpVerifySchema>) {
  const phone = normalizePhoneOrThrow(input.phone);
  const purpose = input.purpose as OtpPurpose;
  const { slot, agentId } = await loadSlot(phone, purpose);
  if (!slot?.codeHash || slot.purpose !== purpose || !slot.expiresAt || slot.expiresAt.getTime() < Date.now()) {
    throw badRequest('Kode OTP kedaluwarsa, minta kode baru', 'OTP_EXPIRED');
  }
  if (slot.attempts >= OTP_MAX_ATTEMPTS) throw badRequest('Terlalu banyak percobaan, minta kode baru', 'OTP_LOCKED');

  if (!(await bcrypt.compare(input.code, slot.codeHash))) {
    const attempts = slot.attempts + 1;
    if (agentId) await prisma.agent.update({ where: { id: agentId }, data: { confirmationCodeAttempts: attempts } });
    else await prisma.phoneVerification.update({ where: { phone }, data: { attempts } });
    throw badRequest('Kode OTP salah', 'OTP_INVALID', { attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attempts) });
  }

  // single use: clear the code
  if (agentId) {
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        confirmationCode: null,
        confirmationCodePurpose: null,
        confirmationCodeExpiresAt: null,
        confirmationCodeAttempts: 0,
        phoneVerifiedAt: new Date(),
      },
    });
  } else {
    await prisma.phoneVerification.delete({ where: { phone } });
  }
  const claims: OtpTicketClaims = { kind: 'otp', phone, purpose };
  return { otpTicket: jwt.sign(claims, process.env.TOKEN_SECRET!, { expiresIn: TICKET_TTL }), phone, purpose };
}

/** Returns the verified phone carried by an otpTicket issued for `purpose`. */
export function readOtpTicket(ticket: string, purpose: OtpPurpose): string {
  try {
    const decoded = jwt.verify(ticket, process.env.TOKEN_SECRET!) as OtpTicketClaims;
    if (decoded.kind !== 'otp' || decoded.purpose !== purpose) throw new Error('bad');
    return decoded.phone;
  } catch {
    throw badRequest('Verifikasi nomor HP kedaluwarsa, ulangi OTP', 'OTP_TICKET_INVALID');
  }
}
