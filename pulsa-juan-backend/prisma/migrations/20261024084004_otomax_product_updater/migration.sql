-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "priceLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StoreConfig" ADD COLUMN     "productMarginFixed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "productMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "productPriceRoundTo" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "stuckAlertedAt" TIMESTAMP(3),
ADD COLUMN     "supplierMessage" TEXT;

-- CreateTable
CREATE TABLE "ProductUpdate" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductUpdate_createdAt_idx" ON "ProductUpdate"("createdAt");
