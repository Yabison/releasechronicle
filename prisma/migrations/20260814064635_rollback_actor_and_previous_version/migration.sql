-- AlterTable
ALTER TABLE "Rollback" ADD COLUMN     "actorName" TEXT,
ADD COLUMN     "previousVersion" TEXT,
ALTER COLUMN "comment" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StatusTransition" ALTER COLUMN "actorName" DROP NOT NULL;
