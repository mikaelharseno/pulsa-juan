import { isPlausibleNik } from 'pulsa-juan-common';
import { z } from 'zod';

import { Agent, KycStatus, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, conflict, HttpError, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { getPrivate, putPrivate } from './privateStorage.service';
import { dashboardLink, escapeHtml, queueAdminAlert } from './telegram.service';

// Identity check for "Plus" services (cash-like products such as e-wallet
// top-ups). The agent sends a KTP photo, a selfie taken right after a passed
// live check, and the NIK + name read off the KTP (confirmed by the agent); an
// admin compares them in the dashboard. Approval writes the NIK to the agent
// and locks it.

const SUBMIT_WINDOW_MS = 15 * 60 * 1000;
const PHOTO_MIME = ['image/jpeg', 'image/png'];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export const kycSubmitSchema = z.object({
  livenessId: z.string().min(10),
  nik: z.string().trim().regex(/^\d{16}$/, 'NIK harus 16 angka'),
  name: z.string().trim().min(2).max(80),
  ocrNik: z.string().trim().max(32).optional(),
  ocrName: z.string().trim().max(120).optional(),
  ocrText: z.string().max(4000).optional(),
});

export const kycReviewSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  reason: z.string().trim().max(300).optional(),
  /** the admin may correct the NIK from the KTP photo before approving */
  nik: z.string().trim().regex(/^\d{16}$/).optional(),
});

export const kycListSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'ALL']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

type Photo = { data: Buffer; mimetype: string; size: number };

function checkPhoto(p: Photo | null, label: string): Photo {
  if (!p) throw badRequest(`Foto ${label} wajib`, 'KYC_PHOTO');
  if (!PHOTO_MIME.includes(p.mimetype)) throw badRequest(`Foto ${label} harus JPG/PNG`, 'KYC_PHOTO');
  if (p.size > MAX_PHOTO_BYTES) throw badRequest(`Foto ${label} maksimal 8MB`, 'KYC_PHOTO');
  return p;
}

/** What the app shows on the verification screens. */
export async function kycState(agent: Pick<Agent, 'id' | 'kycStatus'>) {
  const last = await prisma.kycSubmission.findFirst({ where: { agentId: agent.id }, orderBy: { createdAt: 'desc' }, select: { status: true, rejectReason: true, createdAt: true, reviewedAt: true } });
  return { status: agent.kycStatus, rejectReason: agent.kycStatus === 'REJECTED' ? last?.rejectReason ?? null : null, submittedAt: last?.createdAt ?? null, reviewedAt: last?.reviewedAt ?? null };
}

export async function submitKyc(agent: Agent, input: z.infer<typeof kycSubmitSchema>, ktp: Photo | null, selfie: Photo | null) {
  if (agent.kycStatus === 'VERIFIED') throw badRequest('Identitas sudah terverifikasi', 'KYC_DONE');
  if (agent.kycStatus === 'PENDING') throw badRequest('Verifikasi sedang diperiksa admin', 'KYC_PENDING');
  const k = checkPhoto(ktp, 'KTP');
  const s = checkPhoto(selfie, 'selfie');
  if (!isPlausibleNik(input.nik)) throw badRequest('NIK tidak sesuai format KTP', 'KYC_NIK');

  const live = await prisma.livenessChallenge.findFirst({ where: { id: input.livenessId, agentId: agent.id }, include: { submission: { select: { id: true } } } });
  if (!live || !live.passed) throw badRequest('Cek wajah belum lolos', 'KYC_LIVENESS');
  if (live.submission) throw badRequest('Cek wajah sudah dipakai, ulangi', 'KYC_LIVENESS');
  if (!live.checkedAt || Date.now() - live.checkedAt.getTime() > SUBMIT_WINDOW_MS) throw badRequest('Cek wajah kedaluwarsa, ulangi', 'KYC_LIVENESS');

  const taken = await prisma.agent.findFirst({ where: { nik: input.nik, id: { not: agent.id } }, select: { id: true } });
  if (taken) throw conflict('NIK sudah dipakai akun lain', 'KYC_NIK_TAKEN');

  const [ktpKey, selfieKey] = await Promise.all([
    putPrivate(`kyc/${agent.id}`, 'ktp', k.data, k.mimetype),
    putPrivate(`kyc/${agent.id}`, 'selfie', s.data, s.mimetype),
  ]);
  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.kycSubmission.create({
      data: { agentId: agent.id, ktpKey, selfieKey, livenessId: live.id, nik: input.nik, name: input.name, ocrNik: input.ocrNik ?? null, ocrName: input.ocrName ?? null, ocrText: input.ocrText ?? null },
    });
    const res = await tx.agent.updateMany({ where: { id: agent.id, kycStatus: { in: ['NONE', 'REJECTED'] } }, data: { kycStatus: 'PENDING' } });
    if (!res.count) throw badRequest('Verifikasi sedang diperiksa admin', 'KYC_PENDING');
    return created;
  });
  queueAdminAlert(
    [`🪪 <b>Verifikasi identitas baru</b>`, `${escapeHtml(agent.name)} (${escapeHtml(agent.phone)})`, `NIK ${escapeHtml(input.nik)} · ${escapeHtml(input.name)}`, dashboardLink('/verifikasi', 'Periksa di dashboard →')]
      .filter(Boolean)
      .join('\n'),
  );
  return { id: submission.id, ...(await kycState({ id: agent.id, kycStatus: 'PENDING' })) };
}

/** Blocks a "Plus" service for an agent whose identity is not verified. */
export function assertPlusAllowed(agent: Pick<Agent, 'kycStatus'>, segment: { requiresVerification: boolean; label: string }) {
  if (segment.requiresVerification && agent.kycStatus !== 'VERIFIED') {
    throw new HttpError(403, `${segment.label} termasuk layanan Plus. Verifikasi identitas dulu untuk memakainya.`, 'KYC_REQUIRED');
  }
}

export async function adminListKyc(q: z.infer<typeof kycListSchema>) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 30;
  const where: Prisma.KycSubmissionWhereInput = q.status && q.status !== 'ALL' ? { status: q.status as KycStatus } : q.status === 'ALL' ? {} : { status: 'PENDING' };
  const [total, rows] = await Promise.all([
    prisma.kycSubmission.count({ where }),
    prisma.kycSubmission.findMany({
      where,
      orderBy: { createdAt: q.status === 'PENDING' || !q.status ? 'asc' : 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { agent: { select: { id: true, name: true, phone: true, nik: true } }, liveness: { select: { colors: true, frameKeys: true, metrics: true, passed: true } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    submissions: rows.map(({ ktpKey: _k, selfieKey: _s, liveness, ...r }) => ({
      ...r,
      liveness: { colors: liveness.colors, passed: liveness.passed, metrics: liveness.metrics, frames: ((liveness.frameKeys as string[] | null) ?? []).length },
    })),
  };
}

/** One private photo of a submission: "ktp", "selfie" or "frame-<n>" (0 = white baseline). */
export async function adminKycFile(id: string, kind: string) {
  const s = await prisma.kycSubmission.findUnique({ where: { id }, include: { liveness: { select: { frameKeys: true } } } });
  if (!s) throw notFound('Verifikasi tidak ditemukan');
  let key: string | undefined;
  if (kind === 'ktp') key = s.ktpKey;
  else if (kind === 'selfie') key = s.selfieKey;
  else if (/^frame-\d+$/.test(kind)) key = ((s.liveness.frameKeys as string[] | null) ?? [])[Number(kind.slice(6))];
  if (!key) throw notFound('File tidak ditemukan');
  return getPrivate(key);
}

export async function adminReviewKyc(adminId: string, id: string, input: z.infer<typeof kycReviewSchema>) {
  const s = await prisma.kycSubmission.findUnique({ where: { id } });
  if (!s) throw notFound('Verifikasi tidak ditemukan');
  if (s.status !== 'PENDING') throw conflict('Verifikasi sudah diproses');
  if (input.status === 'REJECTED') {
    if (!input.reason) throw badRequest('Alasan penolakan wajib diisi');
    await prisma.$transaction([
      prisma.kycSubmission.update({ where: { id }, data: { status: 'REJECTED', rejectReason: input.reason, reviewedById: adminId, reviewedAt: new Date() } }),
      prisma.agent.update({ where: { id: s.agentId }, data: { kycStatus: 'REJECTED' } }),
    ]);
    await audit(adminId, 'KYC_REJECT', 'Agent', s.agentId, { submissionId: id, reason: input.reason });
    return { ok: true, status: 'REJECTED' as const };
  }
  const nik = input.nik ?? s.nik;
  const taken = await prisma.agent.findFirst({ where: { nik, id: { not: s.agentId } }, select: { id: true, name: true } });
  if (taken) throw conflict(`NIK sudah dipakai agen ${taken.name}`);
  await prisma.$transaction([
    prisma.kycSubmission.update({ where: { id }, data: { status: 'VERIFIED', nik, reviewedById: adminId, reviewedAt: new Date() } }),
    prisma.agent.update({ where: { id: s.agentId }, data: { kycStatus: 'VERIFIED', nik } }),
  ]);
  await audit(adminId, 'KYC_APPROVE', 'Agent', s.agentId, { submissionId: id, nik });
  return { ok: true, status: 'VERIFIED' as const };
}
