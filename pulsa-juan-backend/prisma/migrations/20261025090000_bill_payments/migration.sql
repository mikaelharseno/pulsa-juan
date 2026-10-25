-- CreateEnum
CREATE TYPE "BillCheckStatus" AS ENUM ('PENDING', 'READY', 'NOT_PAYABLE', 'FAILED', 'USED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "billCheckId" TEXT,
ADD COLUMN     "supplierAdmin" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Biller" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "checkCode" TEXT NOT NULL DEFAULT '',
    "payCode" TEXT NOT NULL DEFAULT '',
    "ourFee" INTEGER NOT NULL DEFAULT 0,
    "nameRe" TEXT,
    "amountRe" TEXT,
    "adminRe" TEXT,
    "totalRe" TEXT,
    "periodeRe" TEXT,
    "notPayableRe" TEXT,
    "failRe" TEXT,
    "validityMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Biller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillCheck" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "agentId" TEXT,
    "adminId" TEXT,
    "billerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "BillCheckStatus" NOT NULL DEFAULT 'PENDING',
    "rawMessage" TEXT,
    "customerName" TEXT,
    "periode" TEXT,
    "amountDue" INTEGER NOT NULL DEFAULT 0,
    "supplierAdmin" INTEGER NOT NULL DEFAULT 0,
    "ourFee" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Biller_key_key" ON "Biller"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BillCheck_number_key" ON "BillCheck"("number");

-- CreateIndex
CREATE INDEX "BillCheck_agentId_createdAt_idx" ON "BillCheck"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "BillCheck_billerId_createdAt_idx" ON "BillCheck"("billerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_billCheckId_key" ON "Transaction"("billCheckId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_billCheckId_fkey" FOREIGN KEY ("billCheckId") REFERENCES "BillCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCheck" ADD CONSTRAINT "BillCheck_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCheck" ADD CONSTRAINT "BillCheck_billerId_fkey" FOREIGN KEY ("billerId") REFERENCES "Biller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

