-- AlterEnum
ALTER TYPE "BankCode" ADD VALUE 'MANDIRI';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "commission" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StoreConfig" ADD COLUMN     "appDownloadUrl" TEXT NOT NULL DEFAULT 'https://pulsa-juan-landing.mikaelharseno.workers.dev/download/pulsa-juan.apk',
ADD COLUMN     "mandiriAccountName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "mandiriAccountNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "minAppVersion" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "AgentPackageOverride" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "hargaAgen" INTEGER,
    "commission" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPackageOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentPackageOverride_packageId_idx" ON "AgentPackageOverride"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPackageOverride_agentId_packageId_key" ON "AgentPackageOverride"("agentId", "packageId");

-- AddForeignKey
ALTER TABLE "AgentPackageOverride" ADD CONSTRAINT "AgentPackageOverride_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPackageOverride" ADD CONSTRAINT "AgentPackageOverride_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
