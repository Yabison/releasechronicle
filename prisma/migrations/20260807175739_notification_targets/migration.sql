-- AlterTable
ALTER TABLE "Hook" ADD COLUMN     "targetId" TEXT;

-- CreateTable
CREATE TABLE "NotificationTarget" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTarget_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Hook" ADD CONSTRAINT "Hook_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "NotificationTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
