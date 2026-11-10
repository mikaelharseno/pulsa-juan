-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "domicileDistrictCode" TEXT,
ADD COLUMN     "domicileLat" DOUBLE PRECISION,
ADD COLUMN     "domicileLng" DOUBLE PRECISION,
ADD COLUMN     "domicileProvinceCode" TEXT,
ADD COLUMN     "domicileRegencyCode" TEXT,
ADD COLUMN     "domicileSource" TEXT;
