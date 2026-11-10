-- AlterTable
ALTER TABLE "StoreConfig" ADD COLUMN     "requirePurchasePin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "invoiceToken" TEXT;

-- CreateTable
CREATE TABLE "AgentSellPrice" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "sellPrice" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSellPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentSellPrice_agentId_packageId_key" ON "AgentSellPrice"("agentId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_invoiceToken_key" ON "Transaction"("invoiceToken");

-- AddForeignKey
ALTER TABLE "AgentSellPrice" ADD CONSTRAINT "AgentSellPrice_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSellPrice" ADD CONSTRAINT "AgentSellPrice_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
