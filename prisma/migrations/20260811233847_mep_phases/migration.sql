-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChangeType" ADD VALUE 'PRE_MEP';
ALTER TYPE "ChangeType" ADD VALUE 'POST_MEP';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

