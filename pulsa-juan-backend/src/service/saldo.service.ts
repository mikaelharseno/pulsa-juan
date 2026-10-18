import { LedgerType, Prisma } from '../../prisma/generated';
import { badRequest } from '../lib/errors';

type Tx = Prisma.TransactionClient;

/**
 * Atomic debit: the guarded updateMany fails (count 0) when saldo < amount,
 * so parallel purchases can never drive the balance negative.
 */
export async function debitSaldo(tx: Tx, agentId: string, amount: number, type: LedgerType, referenceId: string, note?: string) {
  if (amount <= 0) throw badRequest('Nominal tidak valid');
  const res = await tx.agent.updateMany({
    where: { id: agentId, saldo: { gte: amount } },
    data: { saldo: { decrement: amount } },
  });
  if (res.count === 0) throw badRequest('Saldo tidak cukup', 'SALDO_KURANG');
  const agent = await tx.agent.findUniqueOrThrow({ where: { id: agentId }, select: { saldo: true } });
  await tx.saldoLedger.create({
    data: { agentId, type, delta: -amount, balanceAfter: agent.saldo, referenceId, note },
  });
  return Number(agent.saldo);
}

export async function creditSaldo(tx: Tx, agentId: string, amount: number, type: LedgerType, referenceId: string, note?: string) {
  if (amount <= 0) throw badRequest('Nominal tidak valid');
  const agent = await tx.agent.update({
    where: { id: agentId },
    data: { saldo: { increment: amount } },
    select: { saldo: true },
  });
  await tx.saldoLedger.create({
    data: { agentId, type, delta: amount, balanceAfter: agent.saldo, referenceId, note },
  });
  return Number(agent.saldo);
}
