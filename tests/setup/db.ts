// The test DATABASE_URL (port 5433) is injected by vitest.config.ts `test.env`,
// which is the authoritative source — it loads before any module, including the
// Prisma singleton imported below.
import { prisma } from "@/lib/db";

/** Truncate all hierarchy tables between tests. Order respects FKs. */
export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.actionTokenUse.deleteMany();
  await prisma.directoryUser.deleteMany();
  await prisma.publicSetting.deleteMany();
  await prisma.environmentConfig.deleteMany();
  await prisma.environmentGroup.deleteMany();
  await prisma.tagConfig.deleteMany();
  await prisma.calendarFeed.deleteMany();
  await prisma.hookDelivery.deleteMany();
  await prisma.hook.deleteMany();
  await prisma.notificationTarget.deleteMany();
  await prisma.rollback.deleteMany();
  await prisma.qaValidation.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.statusTransition.deleteMany();
  await prisma.eventComment.deleteMany();
  await prisma.event.deleteMany();
  await prisma.ingestSource.deleteMany();
  await prisma.runtimeState.deleteMany();
  await prisma.changelog.deleteMany();
  await prisma.service.deleteMany();
  await prisma.product.deleteMany();
  await prisma.company.deleteMany();
}

export { prisma };
