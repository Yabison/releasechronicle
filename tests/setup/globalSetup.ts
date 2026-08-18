import { closeSync, openSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_URL } from "./testDatabaseUrl";
import { isLockStale, lockFilePath, lockHeldMessage, parseLockInfo } from "./preflightLock";

/**
 * Vitest globalSetup: runs once, before any test file, in its own process
 * (outside the worker pool). Three ordered, fail-fast checks:
 *
 *  1. Exclusive run lock — the test suite corrupts itself under concurrent
 *     `npm test` invocations (shared db_test on port 5433 + resetDb() racing
 *     between runs). A second run must refuse to start, not silently stomp
 *     the first one.
 *  2. DB reachability — a short bounded retry to absorb a genuine container
 *     startup race, not to wait out a sleeping container (that theory was
 *     tried and disproven: the container had been up 22h during the actual
 *     failure).
 *  3. Migration sanity — confirms the schema is actually applied. Twice
 *     during this project's history someone had to discover via opaque
 *     Prisma errors that `prisma migrate deploy` had never been run against
 *     the test DB; this turns that into one clear line up front.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const lockPath = lockFilePath(TEST_DATABASE_URL);
  acquireLock(lockPath);

  try {
    await preflightDatabase();
  } catch (err) {
    // Setup threw, so vitest will never call the teardown we'd otherwise
    // return — release the lock ourselves before propagating.
    releaseLock(lockPath);
    throw err;
  }

  return async () => {
    releaseLock(lockPath);
  };
}

// ---------------------------------------------------------------------------
// 1. Exclusive run lock
// ---------------------------------------------------------------------------

function acquireLock(lockPath: string): void {
  // One retry is enough: the only reason a second attempt is needed is that
  // the first attempt found — and cleared — a stale lock from a crashed run.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // "wx": create exclusively, fail with EEXIST if it already exists.
      // This is the atomic part — two processes racing here can't both win.
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      closeSync(fd);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const info = readLockInfo(lockPath);
      if (info && !isLockStale(info)) {
        throw new Error(lockHeldMessage(info.pid, lockPath));
      }

      // Stale (dead pid) or unreadable/corrupt lock file — safe to clear and
      // retry. Tolerate a concurrent cleanup already having removed it.
      try {
        unlinkSync(lockPath);
      } catch (unlinkErr) {
        if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
      }
    }
  }
  throw new Error(
    `Could not acquire the test-run lock at ${lockPath} after clearing a stale entry. ` +
      `If this persists, delete the file by hand and re-run.`,
  );
}

function readLockInfo(lockPath: string): { pid: number } | null {
  try {
    return parseLockInfo(readFileSync(lockPath, "utf8"));
  } catch {
    // Gone or unreadable between the EEXIST and this read — treat as no lock.
    return null;
  }
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ---------------------------------------------------------------------------
// 2 + 3. DB reachability + migration sanity
// ---------------------------------------------------------------------------

async function preflightDatabase(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  try {
    await checkReachable(prisma);
    await checkMigrated(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Short bounded retry: absorbs a genuine startup race, not a sleeping container. */
async function checkReachable(prisma: PrismaClient): Promise<void> {
  const attempts = 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(1000);
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `Cannot reach the test database at ${TEST_DATABASE_URL} after ${attempts} attempts.\n` +
      `Underlying error: ${detail}\n` +
      `Remedy: run "npm run dev:up" to start the db/db_test/mailpit/ldap containers, then retry.`,
  );
}

/**
 * Confirms the schema is applied by checking for the `Company` table via
 * information_schema.tables — chosen over Prisma's own `_prisma_migrations`
 * bookkeeping table because it directly answers "is the schema actually
 * here?" regardless of how it got there (migrate deploy, migrate dev, or a
 * one-off db push during setup), whereas `_prisma_migrations` only proves a
 * migration history exists, not that it succeeded or matches this schema.
 * `Company` is a root, unmapped, always-present model (no @@map, no FK
 * dependency on anything else), so it's a stable proxy for "schema applied."
 */
async function checkMigrated(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Company'
    ) AS "exists"
  `;
  if (!rows[0]?.exists) {
    throw new Error(
      `Test database schema is not applied (table "Company" not found in ${TEST_DATABASE_URL}).\n` +
        `Run: DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate deploy`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
