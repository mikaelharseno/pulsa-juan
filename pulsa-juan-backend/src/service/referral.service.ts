import { Agent, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { uniqueCommissionId } from './agentAuth.service';

// Two-level referral scheme (plan §1a). Connections are keyed by the
// transferable commisionUniqueId ("crown"), not by agent id.

export interface MarkupResolution {
  parent: { commisionId: string; amount: number } | null;
  grandparent: { commisionId: string; amount: number } | null;
  markupTotal: number;
}

/** parentShare = conn(parent→me).amount, grandparentShare = conn(grandparent→parent).amount */
export async function resolveMarkup(commisionUniqueId: string): Promise<MarkupResolution> {
  const conn1 = await prisma.mitraConnection.findUnique({ where: { childCommisionId: commisionUniqueId } });
  if (!conn1) return { parent: null, grandparent: null, markupTotal: 0 };
  const parent = { commisionId: conn1.parentCommisionId, amount: conn1.commisionAmount };
  const conn2 = await prisma.mitraConnection.findUnique({ where: { childCommisionId: conn1.parentCommisionId } });
  const grandparent = conn2 ? { commisionId: conn2.parentCommisionId, amount: conn2.commisionAmount } : null;
  return { parent, grandparent, markupTotal: parent.amount + (grandparent?.amount ?? 0) };
}

/** Links a freshly registered agent under the owner of `referralCode`. */
export async function attachReferral(child: Agent, referralCode: string) {
  const code = referralCode.trim().toUpperCase();
  const parent = await prisma.agent.findUnique({ where: { commisionUniqueId: code } });
  if (!parent) throw badRequest('Kode referral tidak ditemukan');
  if (parent.id === child.id) throw badRequest('Tidak bisa memakai kode referral sendiri');
  const existing = await prisma.mitraConnection.findUnique({ where: { childCommisionId: child.commisionUniqueId } });
  if (existing) throw badRequest('Akun sudah terhubung ke mitra lain');
  return prisma.mitraConnection.create({
    data: { parentCommisionId: code, childCommisionId: child.commisionUniqueId, commisionAmount: parent.referralMarkup },
  });
}

export async function mitraOverview(agent: Agent) {
  const [up, children] = await Promise.all([
    prisma.mitraConnection.findUnique({ where: { childCommisionId: agent.commisionUniqueId } }),
    prisma.mitraConnection.findMany({ where: { parentCommisionId: agent.commisionUniqueId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const codes = [...children.map((c) => c.childCommisionId), ...(up ? [up.parentCommisionId] : [])];
  const agents = codes.length
    ? await prisma.agent.findMany({ where: { commisionUniqueId: { in: codes } }, select: { name: true, commisionUniqueId: true, createdAt: true } })
    : [];
  const byCode = Object.fromEntries(agents.map((a) => [a.commisionUniqueId, a]));
  return {
    commisionUniqueId: agent.commisionUniqueId,
    referralMarkup: agent.referralMarkup,
    parent: up ? { name: byCode[up.parentCommisionId]?.name ?? '-', commisionAmount: up.commisionAmount } : null,
    children: children.map((c) => ({
      id: c.id,
      name: byCode[c.childCommisionId]?.name ?? '-',
      commisionUniqueId: c.childCommisionId,
      commisionAmount: c.commisionAmount,
      joinedAt: c.createdAt,
    })),
  };
}

/** OWNER hands the crown to another agent; the source gets a fresh code. */
export async function transferCommissionId(adminId: string, fromAgentId: string, toAgentId: string) {
  if (fromAgentId === toAgentId) throw badRequest('Agen asal dan tujuan sama');
  const [from, to] = await Promise.all([
    prisma.agent.findUnique({ where: { id: fromAgentId } }),
    prisma.agent.findUnique({ where: { id: toAgentId } }),
  ]);
  if (!from || !to) throw notFound('Agen tidak ditemukan');
  const crown = from.commisionUniqueId;
  const oldTarget = to.commisionUniqueId;
  const fresh = await uniqueCommissionId();
  await prisma.$transaction(async (tx) => {
    // free the codes first: unique constraint
    await tx.agent.update({ where: { id: from.id }, data: { commisionUniqueId: fresh + '_' } });
    await tx.agent.update({ where: { id: to.id }, data: { commisionUniqueId: crown } });
    await tx.agent.update({ where: { id: from.id }, data: { commisionUniqueId: fresh } });
    // the target's own old downline/upline moves to the source's fresh code so nothing dangles
    await tx.mitraConnection.updateMany({ where: { parentCommisionId: oldTarget }, data: { parentCommisionId: fresh } });
    await tx.mitraConnection.updateMany({ where: { childCommisionId: oldTarget }, data: { childCommisionId: fresh } });
    await tx.agentMarkupCommision.updateMany({ where: { beneficiaryCommisionId: oldTarget }, data: { beneficiaryCommisionId: fresh } });
  });
  await audit(adminId, 'TRANSFER_COMMISSION_ID', 'Agent', from.id, { toAgentId: to.id, crown, freshCodeForSource: fresh });
  return { fromAgentId: from.id, toAgentId: to.id, commisionUniqueId: crown, sourceNewCode: fresh };
}

export async function listConnections() {
  const rows = await prisma.mitraConnection.findMany({ orderBy: { createdAt: 'desc' } });
  const codes = Array.from(new Set(rows.flatMap((r) => [r.parentCommisionId, r.childCommisionId])));
  const agents = codes.length
    ? await prisma.agent.findMany({ where: { commisionUniqueId: { in: codes } }, select: { id: true, name: true, commisionUniqueId: true } })
    : [];
  const byCode = Object.fromEntries(agents.map((a) => [a.commisionUniqueId, a]));
  return rows.map((r) => ({
    ...r,
    parent: byCode[r.parentCommisionId] ?? null,
    child: byCode[r.childCommisionId] ?? null,
  }));
}

export async function updateConnectionAmount(adminId: string, id: string, amount: number) {
  const row = await prisma.mitraConnection.update({ where: { id }, data: { commisionAmount: amount } });
  await audit(adminId, 'UPDATE_CONNECTION_AMOUNT', 'MitraConnection', id, { amount });
  return row;
}

export type Tx = Prisma.TransactionClient;
