-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "requiresVerification" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StoreConfig" ADD COLUMN     "livenessMinShift" DOUBLE PRECISION NOT NULL DEFAULT 0.012;

-- CreateTable
CREATE TABLE "KycSubmission" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "ktpKey" TEXT NOT NULL,
    "selfieKey" TEXT NOT NULL,
    "livenessId" TEXT NOT NULL,
    "ocrNik" TEXT,
    "ocrName" TEXT,
    "ocrText" TEXT,
    "nik" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivenessChallenge" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "colors" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "frameKeys" JSONB,
    "metrics" JSONB,
    "passed" BOOLEAN,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivenessChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KycSubmission_livenessId_key" ON "KycSubmission"("livenessId");

-- CreateIndex
CREATE INDEX "KycSubmission_status_createdAt_idx" ON "KycSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KycSubmission_agentId_createdAt_idx" ON "KycSubmission"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "LivenessChallenge_agentId_createdAt_idx" ON "LivenessChallenge"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "KycSubmission" ADD CONSTRAINT "KycSubmission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycSubmission" ADD CONSTRAINT "KycSubmission_livenessId_fkey" FOREIGN KEY ("livenessId") REFERENCES "LivenessChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivenessChallenge" ADD CONSTRAINT "LivenessChallenge_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- E-wallet top-ups are cash-like: they need a verified identity ("Plus")
UPDATE "Segment" SET "requiresVerification" = true WHERE "groupLabel" = 'E-Wallet';
