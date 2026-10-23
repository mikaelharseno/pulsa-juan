-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TopUpStatus" AS ENUM ('PENDING', 'CLAIMED', 'PAID', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'RESET_PIN', 'VERIFY_PHONE');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('TOPUP', 'PURCHASE', 'REFUND', 'ADJUSTMENT', 'COMMISSION');

-- CreateEnum
CREATE TYPE "BankCode" AS ENUM ('BRI', 'BCA');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('TELKOMSEL', 'XL', 'AXIS', 'INDOSAT', 'TRI', 'SMARTFREN');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('UNCLAIMED', 'CLAIMED', 'VOIDED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "nik" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "pinHash" TEXT,
    "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "confirmationCode" TEXT,
    "confirmationCodeExpiresAt" TIMESTAMP(3),
    "confirmationCodePurpose" "OtpPurpose",
    "confirmationCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "confirmationCodeSentAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "saldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "hutang" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "poin" INTEGER NOT NULL DEFAULT 0,
    "commisionUniqueId" TEXT NOT NULL,
    "saldoKomisi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "referralMarkup" INTEGER NOT NULL DEFAULT 0,
    "referrerAgentId" TEXT,
    "referrerMarkup" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "AgentMarkupCommision" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sourceAgentId" TEXT NOT NULL,
    "beneficiaryCommisionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMarkupCommision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaldoLedger" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "delta" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "referenceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaldoLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopUpOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "kodeUnik" INTEGER NOT NULL,
    "totalTransfer" DECIMAL(14,2) NOT NULL,
    "bank" "BankCode",
    "status" "TopUpStatus" NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "proofImageUrl" TEXT,
    "isCredit" BOOLEAN NOT NULL DEFAULT false,
    "rejectReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopUpOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "iconUrl" TEXT,
    "groupLabel" TEXT,
    "badge" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMessage" TEXT,
    "draftTree" JSONB,
    "draftUpdatedAt" TIMESTAMP(3),
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentTreeVersion" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "tree" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL,

    CONSTRAINT "SegmentTreeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "provider" "Provider",
    "hargaAgen" INTEGER NOT NULL,
    "hargaBeli" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "supplierName" TEXT,
    "supplierSku" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPrefix" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProviderPrefix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "trxNumber" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "segmentLabel" TEXT NOT NULL,
    "treeVersionId" TEXT NOT NULL,
    "packageId" TEXT,
    "steps" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "phoneNumber" TEXT,
    "customerId" TEXT,
    "amountBase" INTEGER NOT NULL,
    "adminFee" INTEGER NOT NULL DEFAULT 0,
    "markupTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'MANUAL',
    "provider" TEXT,
    "supplierRef" TEXT,
    "serialNumber" TEXT,
    "failReason" TEXT,
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "appName" TEXT NOT NULL DEFAULT 'Pulsa Juan',
    "csWhatsapp" TEXT NOT NULL DEFAULT '',
    "csTelegram" TEXT NOT NULL DEFAULT '',
    "topUpMin" INTEGER NOT NULL DEFAULT 10000,
    "topUpMax" INTEGER NOT NULL DEFAULT 5000000,
    "topUpExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "briAccountNumber" TEXT NOT NULL DEFAULT '',
    "briAccountName" TEXT NOT NULL DEFAULT '',
    "bcaAccountNumber" TEXT NOT NULL DEFAULT '',
    "bcaAccountName" TEXT NOT NULL DEFAULT '',
    "banners" JSONB NOT NULL DEFAULT '[]',
    "maxReferralMarkup" INTEGER NOT NULL DEFAULT 2000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_phone_key" ON "Agent"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_nik_key" ON "Agent"("nik");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_googleSub_key" ON "Agent"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_commisionUniqueId_key" ON "Agent"("commisionUniqueId");

-- CreateIndex
CREATE INDEX "AgentMarkupCommision_beneficiaryCommisionId_status_idx" ON "AgentMarkupCommision"("beneficiaryCommisionId", "status");

-- CreateIndex
CREATE INDEX "AgentMarkupCommision_transactionId_idx" ON "AgentMarkupCommision"("transactionId");

-- CreateIndex
CREATE INDEX "SaldoLedger_agentId_createdAt_idx" ON "SaldoLedger"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TopUpOrder_orderNumber_key" ON "TopUpOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "TopUpOrder_status_createdAt_idx" ON "TopUpOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TopUpOrder_agentId_createdAt_idx" ON "TopUpOrder"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_slug_key" ON "Segment"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_publishedVersionId_key" ON "Segment"("publishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentTreeVersion_segmentId_version_key" ON "SegmentTreeVersion"("segmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Package_code_key" ON "Package"("code");

-- CreateIndex
CREATE INDEX "Package_category_isActive_sortOrder_idx" ON "Package"("category", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPrefix_prefix_key" ON "ProviderPrefix"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_trxNumber_key" ON "Transaction"("trxNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_agentId_createdAt_idx" ON "Transaction"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_phoneNumber_idx" ON "Transaction"("phoneNumber");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_referrerAgentId_fkey" FOREIGN KEY ("referrerAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMarkupCommision" ADD CONSTRAINT "AgentMarkupCommision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMarkupCommision" ADD CONSTRAINT "AgentMarkupCommision_sourceAgentId_fkey" FOREIGN KEY ("sourceAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoLedger" ADD CONSTRAINT "SaldoLedger_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopUpOrder" ADD CONSTRAINT "TopUpOrder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "SegmentTreeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentTreeVersion" ADD CONSTRAINT "SegmentTreeVersion_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_treeVersionId_fkey" FOREIGN KEY ("treeVersionId") REFERENCES "SegmentTreeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
