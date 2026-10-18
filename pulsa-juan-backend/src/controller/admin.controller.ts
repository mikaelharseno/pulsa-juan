import { Request, Response } from 'express';
import { UploadedFile } from 'express-fileupload';
import { z } from 'zod';

import { asyncHandler, badRequest } from '../lib/errors';
import { toPlain } from '../lib/serialize';
import { parse } from '../lib/validate';
import { loginAdmin } from '../service/adminAuth.service';
import * as agents from '../service/agentAdmin.service';
import { adminListCommissions } from '../service/commission.service';
import { configUpdateSchema, getConfig, updateConfig } from '../service/config.service';
import * as pkg from '../service/package.service';
import { deletePrefix, listPrefixes, prefixSchema, upsertPrefix } from '../service/prefix.service';
import { listConnections, transferCommissionId, updateConnectionAmount } from '../service/referral.service';
import * as seg from '../service/segment.service';
import * as topup from '../service/topup.service';
import * as trx from '../service/transaction.service';
import { uploadImage } from '../service/upload.service';

const PROOF_MIME = ['image/jpeg', 'image/png'];
const PROOF_MAX = 5 * 1024 * 1024;

function singleFile(req: Request, field: string): UploadedFile | null {
  const f = req.files?.[field];
  if (!f) return null;
  return Array.isArray(f) ? f[0] : f;
}

/** Multipart bodies arrive as strings; coerce the few typed fields. */
function multipartBody(req: Request) {
  const body = { ...(req.body ?? {}) } as Record<string, unknown>;
  if (typeof body.credit === 'string') body.credit = body.credit === 'true' || body.credit === '1';
  if (typeof body.amount === 'string') body.amount = Number(body.amount);
  return body;
}

export const postLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const session = await loginAdmin(email, password);
  if (!session) return res.status(401).json({ error: 'Email atau password salah' });
  res.json(session);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json({ admin: req.admin });
});

// ---- top ups ----
export const getTopUps = asyncHandler(async (req: Request, res: Response) => {
  res.json({ topUps: toPlain(await topup.adminListTopUps(req.query.status as string | undefined)) });
});

export const putTopUp = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(topup.adminTopUpUpdateSchema, multipartBody(req));
  let proofImageUrl: string | null = null;
  const proof = singleFile(req, 'proof');
  if (proof) proofImageUrl = (await uploadImage('topup-proof', proof, { allowedMime: PROOF_MIME, maxBytes: PROOF_MAX })).url;
  res.json(toPlain(await topup.adminUpdateTopUp({ adminId: req.admin!.adminId, role: req.admin!.role }, req.params.id, { ...input, proofImageUrl })));
});

export const postHutangPayment = asyncHandler(async (req: Request, res: Response) => {
  const { amount } = parse(topup.hutangPaymentSchema, multipartBody(req));
  const proof = singleFile(req, 'proof');
  const proofImageUrl = proof ? (await uploadImage('hutang-proof', proof, { allowedMime: PROOF_MIME, maxBytes: PROOF_MAX })).url : null;
  res.json(toPlain(await topup.hutangPayment(req.admin!.adminId, req.params.id, amount, proofImageUrl)));
});

// ---- transactions ----
export const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({ status: z.string().optional(), search: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }),
    req.query,
  );
  res.json(await trx.adminList(q));
});

export const putTransaction = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(trx.adminUpdateSchema, req.body);
  res.json(await trx.settleTransaction(req.params.id, input, req.admin!.adminId));
});

// ---- agents ----
export const getAgents = asyncHandler(async (req: Request, res: Response) => {
  res.json({ agents: toPlain(await agents.listAgents({ search: req.query.search as string, status: req.query.status as string })) });
});
export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  res.json(toPlain(await agents.getAgentDetail(req.params.id)));
});
export const putAgent = asyncHandler(async (req: Request, res: Response) => {
  res.json(toPlain(await agents.updateAgent(req.admin!.adminId, req.params.id, parse(agents.agentUpdateSchema, req.body))));
});
export const postAdjustSaldo = asyncHandler(async (req: Request, res: Response) => {
  res.json(await agents.adjustSaldo(req.admin!.adminId, req.params.id, parse(agents.adjustSaldoSchema, req.body)));
});
export const postTransferCommissionId = asyncHandler(async (req: Request, res: Response) => {
  const { toAgentId } = parse(z.object({ toAgentId: z.string().min(1) }), req.body);
  res.json(await transferCommissionId(req.admin!.adminId, req.params.id, toAgentId));
});

// ---- mitra / commissions ----
export const getConnections = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ connections: await listConnections() });
});
export const putConnection = asyncHandler(async (req: Request, res: Response) => {
  const { commisionAmount } = parse(z.object({ commisionAmount: z.number().int().min(0) }), req.body);
  res.json(await updateConnectionAmount(req.admin!.adminId, req.params.id, commisionAmount));
});
export const getCommissions = asyncHandler(async (req: Request, res: Response) => {
  res.json({ commissions: await adminListCommissions({ agentId: req.query.agent as string, status: req.query.status as string }) });
});

// ---- segments ----
export const getSegments = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ segments: await seg.adminListSegments() });
});
export const getSegment = asyncHandler(async (req: Request, res: Response) => {
  res.json(await seg.adminGetSegment(req.params.id));
});
export const postSegment = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await seg.createSegment(parse(seg.segmentSchema, req.body)));
});
export const putSegment = asyncHandler(async (req: Request, res: Response) => {
  res.json(await seg.updateSegment(req.params.id, parse(seg.segmentSchema.partial(), req.body)));
});
export const putSegmentsReorder = asyncHandler(async (req: Request, res: Response) => {
  res.json({ segments: await seg.reorderSegments(parse(seg.reorderSchema, req.body).ids) });
});
export const deleteSegment = asyncHandler(async (req: Request, res: Response) => {
  await seg.deleteSegment(req.params.id);
  res.status(204).end();
});
export const putSegmentDraft = asyncHandler(async (req: Request, res: Response) => {
  const { tree } = parse(z.object({ tree: z.unknown() }), req.body);
  res.json(await seg.saveDraft(req.admin!.adminId, req.params.id, tree));
});
export const postSegmentValidate = asyncHandler(async (req: Request, res: Response) => {
  const { tree, strict } = parse(z.object({ tree: z.unknown(), strict: z.boolean().optional() }), req.body);
  res.json(await seg.validateTree(tree, !!strict));
});
export const postSegmentPublish = asyncHandler(async (req: Request, res: Response) => {
  res.json(await seg.publishSegment(req.admin!.adminId, req.params.id));
});
export const postSegmentDuplicate = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await seg.duplicateSegment(req.admin!.adminId, req.params.id, parse(seg.duplicateSchema, req.body ?? {})));
});
export const getSegmentVersions = asyncHandler(async (req: Request, res: Response) => {
  res.json({ versions: await seg.listVersions(req.params.id) });
});
export const postSegmentRestore = asyncHandler(async (req: Request, res: Response) => {
  const { versionId } = parse(z.object({ versionId: z.string().min(1) }), req.body);
  res.json(await seg.restoreVersion(req.admin!.adminId, req.params.id, versionId));
});
export const postSegmentDiscardDraft = asyncHandler(async (req: Request, res: Response) => {
  res.json(await seg.discardDraft(req.params.id));
});

// ---- packages ----
export const getPackages = asyncHandler(async (req: Request, res: Response) => {
  res.json({ packages: await pkg.listPackages({ category: req.query.category as string, q: req.query.q as string }) });
});
export const getPackageCategories = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ categories: await pkg.listCategories() });
});
export const postPackage = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await pkg.createPackage(parse(pkg.packageSchema, req.body)));
});
export const putPackage = asyncHandler(async (req: Request, res: Response) => {
  res.json(await pkg.updatePackage(req.params.id, parse(pkg.packageSchema.partial(), req.body)));
});
export const deletePackage = asyncHandler(async (req: Request, res: Response) => {
  await pkg.deletePackage(req.params.id);
  res.status(204).end();
});
export const postPackagesImport = asyncHandler(async (req: Request, res: Response) => {
  const { csv } = parse(z.object({ csv: z.string().min(1) }), req.body);
  res.json(await pkg.importPackagesCsv(csv));
});

// ---- prefixes / config / uploads ----
export const getPrefixes = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ prefixes: await listPrefixes() });
});
export const postPrefix = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await upsertPrefix(parse(prefixSchema, req.body)));
});
export const deletePrefixHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePrefix(req.params.id);
  res.status(204).end();
});
export const getConfigHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await getConfig());
});
export const putConfigHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await updateConfig(parse(configUpdateSchema, req.body)));
});
export const postUpload = asyncHandler(async (req: Request, res: Response) => {
  const file = singleFile(req, 'file');
  if (!file) throw badRequest('File tidak ditemukan (field "file")');
  const folder = typeof req.body?.folder === 'string' ? req.body.folder : 'media';
  res.status(201).json(await uploadImage(folder, file));
});
