-- DropForeignKey
ALTER TABLE "Hook" DROP CONSTRAINT "Hook_targetId_fkey";

-- AddForeignKey
ALTER TABLE "Hook" ADD CONSTRAINT "Hook_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "NotificationTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
