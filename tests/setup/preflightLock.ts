import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Pure/unit-testable pieces of the global-setup exclusive run lock. File I/O
 * and process-lifecycle wiring live in globalSetup.ts, which is exercised by
 * running the suite itself rather than by unit tests.
 */

export interface LockInfo {
  pid: number;
}

/**
 * Deterministic lock file path for a given DATABASE_URL, placed in the OS
 * temp dir (not node_modules or the repo) so that separate git worktrees of
 * this repo — which have their own node_modules but share the same db_test
 * container on port 5433 — resolve to the SAME lock file and therefore
 * actually contend with each other.
 */
export function lockFilePath(databaseUrl: string, tmpDir: string = tmpdir()): string {
  const hash = createHash("sha256").update(databaseUrl).digest("hex").slice(0, 16);
  return join(tmpDir, `releasechronicle-test-db-${hash}.lock`);
}

/**
 * Whether `pid` names a live process, from the outside, without permission
 * to signal it. `process.kill(pid, 0)` sends no signal, just probes:
 *  - ESRCH ("no such process")      -> definitely dead
 *  - EPERM ("exists, not ours")     -> alive (Windows and POSIX both use this
 *                                      for "found it, can't touch it")
 *  - anything else / no error       -> alive; err on the side of NOT stealing
 *                                      the lock out from under a live run
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return true;
  }
}

/** Parses lock file contents; `null` for anything unreadable (treated as stale). */
export function parseLockInfo(raw: string): LockInfo | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "pid" in parsed &&
      typeof (parsed as { pid: unknown }).pid === "number"
    ) {
      return { pid: (parsed as { pid: number }).pid };
    }
    return null;
  } catch {
    return null;
  }
}

/** A lock is stale (safe to take over) when its owning pid is no longer alive. */
export function isLockStale(info: LockInfo): boolean {
  return !isPidAlive(info.pid);
}

/** The refusal message shown when a live run already holds the lock. */
export function lockHeldMessage(pid: number, lockPath: string): string {
  return (
    `Another test run holds the lock (pid ${pid}) at ${lockPath}.\n` +
    `The test DB (port 5433) and resetDb() are not safe under concurrent runs.\n` +
    `Wait for the other run to finish, or delete the lock file yourself if you are ` +
    `certain no run is active.`
  );
}
