import { Agent, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';
import { audit } from './audit.service';
import { uniqueCommissionId } from './agentAuth.service';

// Two-level referral scheme. The upline lives on Agent.referrerAgentId with the
// markup frozen at join time in Agent.referrerMarkup. Commissions are still
// paid to the transferable commisionUniqueId ("crown"), not to an agent id.

export interface MarkupResolution {
  parent: { commisionId: string; amount: number } | null;
  grandparent: { commisionId: string; amount: number } | null;
  markupTotal: number;
}

/** parentShare = my referrerMarkup, grandparentShare = my parent's referrerMarkup. */
export async function resolveMarkup(agentId: string): Promise<MarkupResolution> {
  const me = await prisma.agent.findUnique({ where: { id: agentId }, select: { referrerAgentId: true, referrerMarkup: true } });
  if (!me?.referrerAgentId) return { parent: null, grandparent: null, markupTotal: 0 };
  const parentRow = await prisma.agent.findUniqueOrThrow({
    where: { id: me.referrerAgentId },
    select: { commisionUniqueId: true, referrerAgentId: true, referrerMarkup: true },
  });
  const parent = { commisionId: parentRow.commisionUniqueId, amount: me.referrerMarkup };
  const grandRow = parentRow.referrerAgentId
    ? await prisma.agent.findUnique({ where: { id: parentRow.referrerAgentId }, select: { commisionUniqueId: true } })
    : null;
  const grandparent = grandRow ? { commisionId: grandRow.commisionUniqueId, amount: parentRow.referrerMarkup } : null;
  return { parent, grandparent, markupTotal: parent.amount + (grandparent?.amount ?? 0) };
}

/** The agent owning `referralCode` (used at registration). */
export async function findReferrer(referralCode: string) {
  const parent = await prisma.agent.findUnique({ where: { commisionUniqueId: referralCode.trim().toUpperCase() } });
  if (!parent) throw badRequest('Kode referral tidak ditemukan');
  return parent;
}

export async function mitraOverview(agent: Agent) {
  const [up, children] = await Promise.all([
    agent.referrerAgentId ? prisma.agent.findUnique({ where: { id: agent.referrerAgentId }, select: { name: true } }) : null,
    prisma.agent.findMany({
      where: { referrerAgentId: agent.id },
      orderBy: { joinedAt: 'desc' },
      select: { id: true, name: true, commisionUniqueId: true, referrerMarkup: true, joinedAt: true },
    }),
  ]);
  return {
    commisionUniqueId: agent.commisionUniqueId,
    referralMarkup: agent.referralMarkup,
    parent: up ? { name: up.name, commisionAmount: agent.referrerMarkup } : null,
    children: children.map((c) => ({
      id: c.id,
      name: c.name,
      commisionUniqueId: c.commisionUniqueId,
      commisionAmount: c.referrerMarkup,
      joinedAt: c.joinedAt,
    })),
  };
}

/**
 * OWNER hands the crown to another agent: the target takes over the source's
 * position (upline, frozen markup, downline, unclaimed commissions) and the
 * source takes the target's old position under a fresh code.
 */
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
  // positions swap, so every pointer to one of them flips to the other
  const swap = (id: string | null) => (id === from.id ? to.id : id === to.id ? from.id : id);
  await prisma.$transaction(async (tx) => {
    // free the codes first: unique constraint
    await tx.agent.update({ where: { id: from.id }, data: { commisionUniqueId: fresh + '_' } });
    await tx.agent.update({ where: { id: to.id }, data: { commisionUniqueId: crown } });
    await tx.agent.update({ where: { id: from.id }, data: { commisionUniqueId: fresh } });

    const others = { id: { notIn: [from.id, to.id] } };
    const [fromChildren, toChildren] = await Promise.all([
      tx.agent.findMany({ where: { referrerAgentId: from.id, ...others }, select: { id: true } }),
      tx.agent.findMany({ where: { referrerAgentId: to.id, ...others }, select: { id: true } }),
    ]);
    await tx.agent.updateMany({ where: { id: { in: fromChildren.map((c) => c.id) } }, data: { referrerAgentId: to.id } });
    await tx.agent.updateMany({ where: { id: { in: toChildren.map((c) => c.id) } }, data: { referrerAgentId: from.id } });
    await tx.agent.update({ where: { id: to.id }, data: { referrerAgentId: swap(from.referrerAgentId), referrerMarkup: from.referrerMarkup } });
    await tx.agent.update({ where: { id: from.id }, data: { referrerAgentId: swap(to.referrerAgentId), referrerMarkup: to.referrerMarkup } });

    await tx.agentMarkupCommision.updateMany({ where: { beneficiaryCommisionId: oldTarget }, data: { beneficiaryCommisionId: fresh } });
  });
  await audit(adminId, 'TRANSFER_COMMISSION_ID', 'Agent', from.id, { toAgentId: to.id, crown, freshCodeForSource: fresh });
  return { fromAgentId: from.id, toAgentId: to.id, commisionUniqueId: crown, sourceNewCode: fresh };
}

/** Every referral link, shaped like the old MitraConnection rows (id = child agent id). */
export async function listConnections() {
  const children = await prisma.agent.findMany({
    where: { referrerAgentId: { not: null } },
    orderBy: { joinedAt: 'desc' },
    select: {
      id: true,
      name: true,
      commisionUniqueId: true,
      referrerMarkup: true,
      joinedAt: true,
      referrer: { select: { id: true, name: true, commisionUniqueId: true } },
    },
  });
  return children.map((c) => ({
    id: c.id,
    parentCommisionId: c.referrer!.commisionUniqueId,
    childCommisionId: c.commisionUniqueId,
    commisionAmount: c.referrerMarkup,
    createdAt: c.joinedAt,
    parent: c.referrer,
    child: { id: c.id, name: c.name, commisionUniqueId: c.commisionUniqueId },
  }));
}

/** Edits the markup frozen on a referral link; `childAgentId` is the connection id. */
export async function updateConnectionAmount(adminId: string, childAgentId: string, amount: number) {
  const row = await prisma.agent.update({ where: { id: childAgentId }, data: { referrerMarkup: amount }, select: { id: true, referrerMarkup: true } });
  await audit(adminId, 'UPDATE_CONNECTION_AMOUNT', 'Agent', childAgentId, { amount });
  return { id: row.id, commisionAmount: row.referrerMarkup };
}

export type Tx = Prisma.TransactionClient;
