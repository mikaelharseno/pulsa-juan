-- AlterEnum
ALTER TYPE "BankCode" ADD VALUE 'QRIS';

-- AlterTable
ALTER TABLE "TopUpOrder" ADD COLUMN     "adminFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "qrisCodeId" TEXT;

-- CreateTable
CREATE TABLE "QrisCode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "monthlyLimit" INTEGER NOT NULL DEFAULT 20000000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrisCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopUpOrder_qrisCodeId_status_idx" ON "TopUpOrder"("qrisCodeId", "status");

-- AddForeignKey
ALTER TABLE "TopUpOrder" ADD CONSTRAINT "TopUpOrder_qrisCodeId_fkey" FOREIGN KEY ("qrisCodeId") REFERENCES "QrisCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
