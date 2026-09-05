import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLockStale, isPidAlive, lockFilePath, lockHeldMessage, parseLockInfo } from "./preflightLock";

describe("lockFilePath", () => {
  it("is deterministic: the same URL always yields the same path", () => {
    const url = "postgresql://rc:rc@localhost:5433/releasechronicle_test";
    expect(lockFilePath(url)).toBe(lockFilePath(url));
  });

  it("keys on the URL: different URLs yield different paths", () => {
    const a = lockFilePath("postgresql://rc:rc@localhost:5433/releasechronicle_test");
    const b = lockFilePath("postgresql://rc:rc@localhost:5433/some_other_db");
    expect(a).not.toBe(b);
  });

  it("places the lock under the given (OS temp) directory, not node_modules or the repo", () => {
    const fakeTmpDir = join(tmpdir(), "fake-os-tmp");
    const path = lockFilePath("postgresql://rc:rc@localhost:5433/releasechronicle_test", fakeTmpDir);
    expect(path.startsWith(fakeTmpDir)).toBe(true);
    expect(path).not.toContain("node_modules");
  });
});

describe("isPidAlive / isLockStale", () => {
  it("judges the current process as live", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isLockStale({ pid: process.pid })).toBe(false);
  });

  it("judges a pid that has already exited as dead/stale", () => {
    // Spawn a trivial child and wait for it to fully exit (spawnSync blocks
    // until reaped), so this pid is guaranteed to not be alive by the time
    // we probe it — unlike a hardcoded large number, which risks flakiness
    // if the OS happens to have reused it.
    const child = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    const deadPid = child.pid;
    expect(typeof deadPid).toBe("number");
    expect(isPidAlive(deadPid as number)).toBe(false);
    expect(isLockStale({ pid: deadPid as number })).toBe(true);
  });
});

describe("parseLockInfo", () => {
  it("parses a well-formed lock file", () => {
    expect(parseLockInfo(JSON.stringify({ pid: 1234, startedAt: "2026-01-01" }))).toEqual({ pid: 1234 });
  });

  it("treats garbage/corrupt content as unreadable (null)", () => {
    expect(parseLockInfo("not json")).toBeNull();
    expect(parseLockInfo(JSON.stringify({ notAPid: 1 }))).toBeNull();
    expect(parseLockInfo(JSON.stringify({ pid: "1234" }))).toBeNull();
  });
});

describe("lockHeldMessage", () => {
  it("names the pid, the lock path, and what to do", () => {
    const msg = lockHeldMessage(4242, "/tmp/some.lock");
    expect(msg).toContain("4242");
    expect(msg).toContain("/tmp/some.lock");
    expect(msg.toLowerCase()).toContain("wait");
    expect(msg.toLowerCase()).toContain("delete");
  });
});
