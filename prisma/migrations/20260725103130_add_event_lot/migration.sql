-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "lot" TEXT;

-- CreateIndex
CREATE INDEX "Event_lot_idx" ON "Event"("lot");
