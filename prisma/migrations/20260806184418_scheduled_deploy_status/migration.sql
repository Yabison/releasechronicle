-- AlterEnum
ALTER TYPE "DeployStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "scheduledAt" TIMESTAMP(3);
