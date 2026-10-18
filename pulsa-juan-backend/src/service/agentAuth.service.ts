import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { isValidIndoMobile, normalizeIndonesianMobile } from 'pulsa-juan-common';
import { z } from 'zod';

import { Agent, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict } from '../lib/errors';
import { randomCode } from '../lib/ids';
import { AgentClaims } from '../interfaces/http';
import { attachReferral, resolveMarkup } from './referral.service';

export type AgentRow = Agent;

const TOKEN_TTL = '30d';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  email: z.string().trim().email('Email tidak valid').max(120),
  phone: z.string().trim().min(8, 'Nomor HP tidak valid').max(20),
  password: z.string().min(6, 'Password minimal 6 karakter').max(100),
  referralCode: z.string().trim().max(20).optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
});

export const googleSchema = z.object({
  idToken: z.string().min(10),
  referralCode: z.string().trim().max(20).optional(),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
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
  const markup = await resolveMarkup(agent.commisionUniqueId);
  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    phone: agent.phone,
    avatarUrl: agent.avatarUrl,
    status: agent.status,
    saldo: Number(agent.saldo),
    hutang: Number(agent.hutang),
    poin: agent.poin,
    commisionUniqueId: agent.commisionUniqueId,
    saldoKomisi: Number(agent.saldoKomisi),
    referralMarkup: agent.referralMarkup,
    markupTotal: markup.markupTotal,
    createdAt: agent.createdAt,
  };
}

async function session(agent: Agent) {
  return { token: signAgentToken(agent.id), agent: await agentProfile(agent) };
}

export async function registerAgent(input: z.infer<typeof registerSchema>) {
  const phone = normalizeIndonesianMobile(input.phone);
  if (!isValidIndoMobile(phone)) throw badRequest('Nomor HP tidak valid');
  const email = input.email.toLowerCase();
  const [emailTaken, phoneTaken] = await Promise.all([
    prisma.agent.findUnique({ where: { email }, select: { id: true } }),
    prisma.agent.findUnique({ where: { phone }, select: { id: true } }),
  ]);
  if (emailTaken) throw conflict('Email sudah terdaftar');
  if (phoneTaken) throw conflict('Nomor HP sudah terdaftar');

  const commisionUniqueId = await uniqueCommissionId();
  const agent = await prisma.agent.create({
    data: {
      name: input.name,
      email,
      phone,
      passwordHash: await bcrypt.hash(input.password, 10),
      commisionUniqueId,
    },
  });
  if (input.referralCode) await attachReferral(agent, input.referralCode);
  return session(agent);
}

export async function loginAgent(identifier: string, password: string) {
  const asPhone = normalizeIndonesianMobile(identifier);
  const where: Prisma.AgentWhereUniqueInput = identifier.includes('@')
    ? { email: identifier.toLowerCase().trim() }
    : { phone: asPhone };
  const agent = await prisma.agent.findUnique({ where });
  if (!agent || !agent.passwordHash) return null;
  if (!(await bcrypt.compare(password, agent.passwordHash))) return null;
  if (agent.status === 'DISABLED') throw badRequest('Akun dinonaktifkan. Hubungi CS.');
  return session(agent);
}

let oauthClient: OAuth2Client | null = null;

/** Exposed for tests: replaces the Google verifier. */
export let verifyGoogleIdToken = async (idToken: string) => {
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

export async function googleLogin(input: z.infer<typeof googleSchema>) {
  const g = await verifyGoogleIdToken(input.idToken);
  const email = g.email.toLowerCase();
  let agent = await prisma.agent.findUnique({ where: { googleSub: g.sub } });
  let created = false;
  if (!agent) {
    const byEmail = await prisma.agent.findUnique({ where: { email } });
    if (byEmail) {
      agent = await prisma.agent.update({
        where: { id: byEmail.id },
        data: { googleSub: g.sub, avatarUrl: byEmail.avatarUrl ?? g.picture ?? null },
      });
    } else {
      agent = await prisma.agent.create({
        data: { name: g.name, email, googleSub: g.sub, avatarUrl: g.picture ?? null, commisionUniqueId: await uniqueCommissionId() },
      });
      created = true;
      if (input.referralCode) await attachReferral(agent, input.referralCode);
    }
  }
  if (agent.status === 'DISABLED') throw badRequest('Akun dinonaktifkan. Hubungi CS.');
  return { ...(await session(agent)), created };
}

export async function updateProfile(agent: Agent, input: z.infer<typeof profileUpdateSchema>) {
  const data: Prisma.AgentUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) {
    const phone = normalizeIndonesianMobile(input.phone);
    if (!isValidIndoMobile(phone)) throw badRequest('Nomor HP tidak valid');
    const taken = await prisma.agent.findUnique({ where: { phone }, select: { id: true } });
    if (taken && taken.id !== agent.id) throw conflict('Nomor HP sudah terdaftar');
    data.phone = phone;
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
