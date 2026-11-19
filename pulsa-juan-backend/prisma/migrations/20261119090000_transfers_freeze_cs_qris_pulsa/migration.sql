-- CreateEnum
CREATE TYPE "TransferSource" AS ENUM ('AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'DONE', 'REJECTED', 'REVERSED');

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "saldoFrozenAt" TIMESTAMP(3),
ADD COLUMN     "saldoFrozenById" TEXT,
ADD COLUMN     "saldoFrozenReason" TEXT;

-- AlterTable
ALTER TABLE "QrisCode" ADD COLUMN     "maxTopUp" INTEGER;

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "routeByOperator" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StoreConfig" ADD COLUMN     "csFinanceWhatsapp" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "SaldoTransfer" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "fromAgentId" TEXT NOT NULL,
    "toAgentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "source" "TransferSource" NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "idempotencyKey" TEXT,
    "createdByAdminId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reverseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaldoTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaldoTransfer_number_key" ON "SaldoTransfer"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SaldoTransfer_idempotencyKey_key" ON "SaldoTransfer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SaldoTransfer_fromAgentId_createdAt_idx" ON "SaldoTransfer"("fromAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "SaldoTransfer_toAgentId_createdAt_idx" ON "SaldoTransfer"("toAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "SaldoTransfer_status_createdAt_idx" ON "SaldoTransfer"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SaldoTransfer" ADD CONSTRAINT "SaldoTransfer_fromAgentId_fkey" FOREIGN KEY ("fromAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoTransfer" ADD CONSTRAINT "SaldoTransfer_toAgentId_fkey" FOREIGN KEY ("toAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

