-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "sellMargins" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "sellPrice" INTEGER;
