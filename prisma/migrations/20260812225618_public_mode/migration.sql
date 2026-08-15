-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "public" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EnvironmentConfig" ADD COLUMN     "public" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "public" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "public" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PublicSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "eventTypes" TEXT[] DEFAULT ARRAY['DEPLOYMENT', 'MAINTENANCE']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicSetting_pkey" PRIMARY KEY ("id")
);

