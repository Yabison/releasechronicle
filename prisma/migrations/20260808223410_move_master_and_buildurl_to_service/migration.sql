-- AlterTable
ALTER TABLE "Product" DROP COLUMN "buildUrlTemplate",
DROP COLUMN "isMaster";

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "buildUrlTemplate" TEXT,
ADD COLUMN     "isMaster" BOOLEAN NOT NULL DEFAULT false;

