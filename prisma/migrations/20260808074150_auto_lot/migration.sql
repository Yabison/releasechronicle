-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "autoLotNaming" TEXT NOT NULL DEFAULT 'master';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "autoLot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isMaster" BOOLEAN NOT NULL DEFAULT false;
