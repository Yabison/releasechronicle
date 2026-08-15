-- CreateEnum
CREATE TYPE "IngestScope" AS ENUM ('SERVICE', 'COMPANY', 'GLOBAL');

-- DropForeignKey
ALTER TABLE "IngestSource" DROP CONSTRAINT "IngestSource_serviceId_fkey";

-- AlterTable
ALTER TABLE "IngestSource" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "scope" "IngestScope" NOT NULL DEFAULT 'SERVICE',
ALTER COLUMN "serviceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "IngestSource_companyId_idx" ON "IngestSource"("companyId");

-- AddForeignKey
ALTER TABLE "IngestSource" ADD CONSTRAINT "IngestSource_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestSource" ADD CONSTRAINT "IngestSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
