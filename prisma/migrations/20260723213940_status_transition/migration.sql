-- CreateTable
CREATE TABLE "StatusTransition" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fromStatus" "DeployStatus",
    "toStatus" "DeployStatus" NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusTransition_eventId_createdAt_idx" ON "StatusTransition"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "StatusTransition" ADD CONSTRAINT "StatusTransition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
