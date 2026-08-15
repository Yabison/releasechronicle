import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "./seed-demo";
import { assertDemoTarget } from "./demo-guard";

/**
 * Rebuild the demo world from scratch. Meant to run on a schedule (midnight), so
 * whatever visitors did during the day is discarded and the next one arrives at a
 * coherent dataset.
 *
 * Guarded: see demo-guard.ts.
 */
async function main() {
  assertDemoTarget();
  const prisma = new PrismaClient();
  try {
    const summary = await seedDemo(prisma);
    console.log(`[demo-reset] ${new Date().toISOString()} rebuilt: ${summary}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`[demo-reset] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
