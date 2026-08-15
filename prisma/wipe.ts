import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Delete every row from every table, in FK-safe order (children before parents).
 * Shared by the standalone `db:wipe` command and the rundeck seeder.
 */
export async function wipeAll(prisma: PrismaClient): Promise<void> {
  // Event annotations + deliveries first.
  await prisma.hookDelivery.deleteMany();
  await prisma.eventComment.deleteMany();
  await prisma.statusTransition.deleteMany();
  await prisma.rollback.deleteMany();
  await prisma.qaValidation.deleteMany();
  await prisma.observation.deleteMany();
  // Events (self-relation causedBy resolves within the single delete).
  await prisma.event.deleteMany();
  // Hooks reference NotificationTarget (onDelete: Restrict) — hooks must go first.
  await prisma.hook.deleteMany();
  await prisma.notificationTarget.deleteMany();
  // Hierarchy, bottom-up.
  await prisma.ingestSource.deleteMany();
  await prisma.runtimeState.deleteMany();
  await prisma.service.deleteMany();
  await prisma.product.deleteMany();
  await prisma.company.deleteMany();
  // Standalone tables.
  await prisma.environmentConfig.deleteMany();
  await prisma.environmentGroup.deleteMany();
  await prisma.tagConfig.deleteMany();
  await prisma.calendarFeed.deleteMany();
  await prisma.directoryUser.deleteMany();
}

// Run directly: `tsx prisma/wipe.ts`
if (require.main === module) {
  const prisma = new PrismaClient();
  wipeAll(prisma)
    .then(() => console.log("Database wiped."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
