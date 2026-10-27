import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { isValidNik, isValidPin, normalizeIndonesianMobile } from 'pulsa-juan-common';
import { z } from 'zod';

import { Agent, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, unauthorized } from '../lib/errors';
import { randomCode } from '../lib/ids';
import { AgentClaims } from '../interfaces/http';
import { normalizePhoneOrThrow, readOtpTicket } from './otp/otp.service';
import { findReferrer, resolveMarkup } from './referral.service';

export type AgentRow = Agent;

const TOKEN_TTL = '365d';
const GOOGLE_TICKET_TTL = '30m';
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

const pinField = z.string().trim().refine(isValidPin, 'PIN harus 6 angka, tidak boleh sama semua atau berurutan');
const nikField = z.string().trim().refine(isValidNik, 'NIK harus 16 angka');

// Sign-up costs nothing per agent: the phone may come with an OTP ticket
// (verified) or as typed (unverified, no SMS/WhatsApp sent).
export const registerSchema = z
  .object({
    otpTicket: z.string().min(10).optional(),
    phone: z.string().trim().min(8).max(20).optional(),
    googleTicket: z.string().min(10).optional(),
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
    pin: pinField,
    nik: nikField.optional(),
    email: z.string().trim().email('Email tidak valid').max(120).optional(),
    password: z.string().min(6, 'Password minimal 6 karakter').max(100).optional(),
    referralCode: z.string().trim().max(20).optional(),
  })
  .refine((v) => v.otpTicket || v.phone, { message: 'Nomor HP wajib diisi', path: ['phone'] });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
});

export const pinLoginSchema = z.object({
  phone: z.string().trim().min(8).max(20),
  pin: z.string().trim().regex(/^\d{6}$/, 'PIN 6 angka'),
});

export const pinResetSchema = z.object({ otpTicket: z.string().min(10), pin: pinField });

export const pinChangeSchema = z.object({
  oldPin: z.string().trim().regex(/^\d{6}$/).optional(),
  newPin: pinField,
});

export const googleSchema = z.object({ idToken: z.string().min(10) });

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  nik: nikField.optional(),
  /// otpTicket (VERIFY_PHONE) for the new number
  phoneOtpTicket: z.string().min(10).optional(),
  referralMarkup: z.number().int().min(0).optional(),
});

function signAgentToken(agentId: string) {
  const claims: AgentClaims = { kind: 'agent', agentId };
  return jwt.sign(claims, process.env.TOKEN_SECRET!, { expiresIn: TOKEN_TTL });
}

export async function uniqueCommissionId(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(8);
    const exists = await prisma.agent.findUnique({ where: { commisionUniqueId: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error('Gagal membuat kode referral');
}

/** Sanitised profile + the referral markup the agent currently pays. */
export async function agentProfile(agent: Agent) {
  const markup = await resolveMarkup(agent.id);
  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    phone: agent.phone,
    nik: agent.nik,
    avatarUrl: agent.avatarUrl,
    status: agent.status,
    saldo: Number(agent.saldo),
    hutang: Number(agent.hutang),
    poin: agent.poin,
    commisionUniqueId: agent.commisionUniqueId,
    saldoKomisi: Number(agent.saldoKomisi),
    referralMarkup: agent.referralMarkup,
    referrerMarkup: agent.referrerMarkup,
    markupTotal: markup.markupTotal,
    hasPin: !!agent.pinHash,
    hasPassword: !!agent.passwordHash,
    googleLinked: !!agent.googleSub,
    phoneVerified: !!agent.phoneVerifiedAt,
    joinedAt: agent.joinedAt,
    createdAt: agent.createdAt,
  };
}

async function session(agent: Agent) {
  return { token: signAgentToken(agent.id), agent: await agentProfile(agent) };
}

function assertActive(agent: Agent) {
  if (agent.status === 'DISABLED') throw badRequest('Akun dinonaktifkan. Hubungi CS.');
}

// ---- Google ----

interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

interface GoogleTicketClaims extends GoogleIdentity {
  kind: 'google';
}

function readGoogleTicket(ticket: string): GoogleIdentity {
  try {
    const decoded = jwt.verify(ticket, process.env.TOKEN_SECRET!) as GoogleTicketClaims;
    if (decoded.kind !== 'google') throw new Error('bad');
    return { sub: decoded.sub, email: decoded.email, name: decoded.name, picture: decoded.picture };
  } catch {
    throw badRequest('Sesi Google kedaluwarsa, ulangi masuk dengan Google', 'GOOGLE_TICKET_INVALID');
  }
}

let oauthClient: OAuth2Client | null = null;

/** Exposed for tests: replaces the Google verifier. */
export let verifyGoogleIdToken = async (idToken: string): Promise<GoogleIdentity> => {
  const audience = [process.env.GOOGLE_WEB_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID].filter(
    (v): v is string => !!v,
  );
  if (audience.length === 0) throw badRequest('Login Google belum dikonfigurasi');
  if (!oauthClient) oauthClient = new OAuth2Client();
  const ticket = await oauthClient.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw badRequest('Token Google tidak valid');
  return { sub: payload.sub, email: payload.email, name: payload.name ?? payload.email, picture: payload.picture };
};

export function setGoogleVerifier(fn: typeof verifyGoogleIdToken) {
  verifyGoogleIdToken = fn;
}

/**
 * Known Google account (by sub, or linked by email) → session. Unknown account →
 * `{ needsPhone, googleTicket }`: the app asks for the phone number (no OTP)
 * and passes the ticket to /auth/register.
 */
export async function googleLogin(input: z.infer<typeof googleSchema>) {
  const g = await verifyGoogleIdToken(input.idToken);
  const email = g.email.toLowerCase();
  let agent = await prisma.agent.findUnique({ where: { googleSub: g.sub } });
  if (!agent) {
    const byEmail = await prisma.agent.findUnique({ where: { email } });
    if (byEmail) {
      agent = await prisma.agent.update({
        where: { id: byEmail.id },
        data: { googleSub: g.sub, avatarUrl: byEmail.avatarUrl ?? g.picture ?? null },
      });
    }
  }
  if (!agent) {
    const claims: GoogleTicketClaims = { kind: 'google', sub: g.sub, email, name: g.name, picture: g.picture };
    return {
      needsPhone: true as const,
      googleTicket: jwt.sign(claims, process.env.TOKEN_SECRET!, { expiresIn: GOOGLE_TICKET_TTL }),
      profile: { name: g.name, email },
    };
  }
  assertActive(agent);
  return { needsPhone: false as const, ...(await session(agent)) };
}

// ---- register / login ----

export async function registerAgent(input: z.infer<typeof registerSchema>) {
  const phone = input.otpTicket ? readOtpTicket(input.otpTicket, 'REGISTER') : normalizePhoneOrThrow(input.phone!);
  const google = input.googleTicket ? readGoogleTicket(input.googleTicket) : null;
  const email = (google?.email ?? input.email)?.toLowerCase() ?? null;

  const [phoneTaken, emailTaken, nikTaken, googleTaken] = await Promise.all([
    prisma.agent.findUnique({ where: { phone }, select: { id: true } }),
    email ? prisma.agent.findUnique({ where: { email }, select: { id: true } }) : null,
    input.nik ? prisma.agent.findUnique({ where: { nik: input.nik }, select: { id: true } }) : null,
    google ? prisma.agent.findUnique({ where: { googleSub: google.sub }, select: { id: true } }) : null,
  ]);
  if (phoneTaken) throw conflict('Nomor HP sudah terdaftar');
  if (emailTaken) throw conflict('Email sudah terdaftar');
  if (nikTaken) throw conflict('NIK sudah terdaftar');
  if (googleTaken) throw conflict('Akun Google sudah terdaftar');

  const referrer = input.referralCode ? await findReferrer(input.referralCode) : null;
  const agent = await prisma.agent.create({
    data: {
      name: input.name,
      phone,
      phoneVerifiedAt: input.otpTicket ? new Date() : null,
      nik: input.nik ?? null,
      email,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
      pinHash: await bcrypt.hash(input.pin, 10),
      googleSub: google?.sub ?? null,
      avatarUrl: google?.picture ?? null,
      commisionUniqueId: await uniqueCommissionId(),
      referrerAgentId: referrer?.id ?? null,
      referrerMarkup: referrer?.referralMarkup ?? 0,
    },
  });
  return session(agent);
}

/** Email or phone + password (kept alongside PIN login). */
export async function loginAgent(identifier: string, password: string) {
  const where: Prisma.AgentWhereUniqueInput = identifier.includes('@')
    ? { email: identifier.toLowerCase().trim() }
    : { phone: normalizeIndonesianMobile(identifier) };
  const agent = await prisma.agent.findUnique({ where });
  if (!agent || !agent.passwordHash) return null;
  if (!(await bcrypt.compare(password, agent.passwordHash))) return null;
  assertActive(agent);
  return session(agent);
}

/** Phone + 6-digit PIN; PIN_MAX_ATTEMPTS wrong tries lock it for PIN_LOCK_MS. */
export async function loginWithPin(input: z.infer<typeof pinLoginSchema>) {
  const phone = normalizeIndonesianMobile(input.phone);
  const agent = await prisma.agent.findUnique({ where: { phone } });
  if (!agent || !agent.pinHash) throw unauthorized('Nomor HP atau PIN salah', 'PIN_INVALID');
  if (agent.pinLockedUntil && agent.pinLockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((agent.pinLockedUntil.getTime() - Date.now()) / 60000);
    throw unauthorized(`PIN terkunci. Coba lagi dalam ${minutes} menit atau reset PIN.`, 'PIN_LOCKED', { lockedUntil: agent.pinLockedUntil });
  }
  if (!(await bcrypt.compare(input.pin, agent.pinHash))) {
    const attempts = agent.pinFailedAttempts + 1;
    const lock = attempts >= PIN_MAX_ATTEMPTS;
    await prisma.agent.update({
      where: { id: agent.id },
      data: lock ? { pinFailedAttempts: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) } : { pinFailedAttempts: attempts },
    });
    if (lock) throw unauthorized('PIN salah 5 kali. PIN terkunci 15 menit.', 'PIN_LOCKED');
    throw unauthorized('Nomor HP atau PIN salah', 'PIN_INVALID', { attemptsLeft: PIN_MAX_ATTEMPTS - attempts });
  }
  assertActive(agent);
  const fresh = await prisma.agent.update({ where: { id: agent.id }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
  return session(fresh);
}

/** Forgot PIN: OTP (RESET_PIN) proves the phone; sets the new PIN and logs in. */
export async function resetPin(input: z.infer<typeof pinResetSchema>) {
  const phone = readOtpTicket(input.otpTicket, 'RESET_PIN');
  const agent = await prisma.agent.update({
    where: { phone },
    data: { pinHash: await bcrypt.hash(input.pin, 10), pinFailedAttempts: 0, pinLockedUntil: null },
  });
  assertActive(agent);
  return session(agent);
}

export async function changePin(agent: Agent, input: z.infer<typeof pinChangeSchema>) {
  if (agent.pinHash) {
    if (!input.oldPin || !(await bcrypt.compare(input.oldPin, agent.pinHash))) throw badRequest('PIN lama salah', 'PIN_INVALID');
  }
  await prisma.agent.update({ where: { id: agent.id }, data: { pinHash: await bcrypt.hash(input.newPin, 10) } });
  return { ok: true };
}

export async function updateProfile(agent: Agent, input: z.infer<typeof profileUpdateSchema>) {
  const data: Prisma.AgentUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.nik !== undefined) {
    const taken = await prisma.agent.findUnique({ where: { nik: input.nik }, select: { id: true } });
    if (taken && taken.id !== agent.id) throw conflict('NIK sudah terdaftar');
    data.nik = input.nik;
  }
  if (input.phoneOtpTicket !== undefined) {
    const phone = readOtpTicket(input.phoneOtpTicket, 'VERIFY_PHONE');
    const taken = await prisma.agent.findUnique({ where: { phone }, select: { id: true } });
    if (taken && taken.id !== agent.id) throw conflict('Nomor HP sudah terdaftar');
    data.phone = phone;
    data.phoneVerifiedAt = new Date();
  }
  if (input.referralMarkup !== undefined) {
    const config = await prisma.storeConfig.findUnique({ where: { id: 'singleton' } });
    const cap = config?.maxReferralMarkup ?? 2000;
    if (input.referralMarkup > cap) throw badRequest(`Markup referral maksimal Rp ${cap}`);
    data.referralMarkup = input.referralMarkup;
  }
  const updated = await prisma.agent.update({ where: { id: agent.id }, data });
  return agentProfile(updated);
}
