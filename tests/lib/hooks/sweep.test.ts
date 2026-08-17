// tests/lib/hooks/sweep.test.ts
import { describe, it, expect, beforeEach, afterAll, vi, afterEach } from "vitest";
import { resetDb, prisma } from "../../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { register } from "@/lib/hooks/registry";
import { sweepHookDeliveries, startHookSweeper, PENDING_GRACE_MS, SWEEP_BATCH } from "@/lib/hooks/sweep";
import type { Connector, HookEvent } from "@/lib/hooks/types";

const sent: HookEvent[] = [];
register({ type: "t-sweep", async send(e) { sent.push(e); return { ok: true, statusCode: 200 }; } } as Connector);

async function seedHook() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  await createService({ productId: p.id, name: "API", type: "API" });
  return prisma.hook.create({ data: { productId: p.id, type: "t-sweep", events: ["*"], config: {}, enabled: true } });
}
const payload = { kind: "deploy.created", occurredAt: new Date().toISOString(), company: "acme", product: "checkout", service: "api", environment: "PROD", actor: null, data: {} };
function delivery(hookId: string, over: Record<string, unknown>) {
  return prisma.hookDelivery.create({ data: { hookId, kind: "deploy.created", payload, ...over } as never });
}

beforeEach(async () => { await resetDb(); sent.length = 0; });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("sweepHookDeliveries", () => {
  it("retries a due FAILED row and leaves a not-yet-due one alone", async () => {
    const h = await seedHook();
    const due = await delivery(h.id, { status: "FAILED", attempts: 1, nextAttemptAt: new Date(Date.now() - 1000) });
    const later = await delivery(h.id, { status: "FAILED", attempts: 1, nextAttemptAt: new Date(Date.now() + 3_600_000) });
    const res = await sweepHookDeliveries();
    expect(res.retried).toBe(1);
    expect((await prisma.hookDelivery.findUniqueOrThrow({ where: { id: due.id } })).status).toBe("OK");
    expect((await prisma.hookDelivery.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("FAILED");
  });

  it("rescues a PENDING row stuck past the grace (crashed immediate send)", async () => {
    const h = await seedHook();
    const stale = await delivery(h.id, { status: "PENDING", attempts: 0, nextAttemptAt: new Date(Date.now() - PENDING_GRACE_MS - 1000) });
    const fresh = await delivery(h.id, { status: "PENDING", attempts: 0, nextAttemptAt: new Date() });
    const res = await sweepHookDeliveries();
    expect(res.retried).toBe(1);
    expect((await prisma.hookDelivery.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("OK");
    expect((await prisma.hookDelivery.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("PENDING");
  });

  it("caps a sweep at SWEEP_BATCH rows", async () => {
    const h = await seedHook();
    for (let i = 0; i < SWEEP_BATCH + 10; i++) {
      await delivery(h.id, { status: "FAILED", attempts: 1, nextAttemptAt: new Date(Date.now() - 60_000) });
    }
    const res = await sweepHookDeliveries();
    expect(res.retried).toBe(SWEEP_BATCH);
    expect(await prisma.hookDelivery.count({ where: { status: "FAILED" } })).toBe(10);
  });

  it("purges terminal rows past retention, keeps live and recent ones", async () => {
    const h = await seedHook();
    const old = new Date(Date.now() - 91 * 86_400_000);
    const purgedOk = await delivery(h.id, { status: "OK", attempts: 1, nextAttemptAt: null, createdAt: old });
    const purgedDead = await delivery(h.id, { status: "DEAD", attempts: 6, nextAttemptAt: null, createdAt: old });
    const keptRecent = await delivery(h.id, { status: "OK", attempts: 1, nextAttemptAt: null });
    const keptFailed = await delivery(h.id, { status: "FAILED", attempts: 1, nextAttemptAt: new Date(Date.now() + 3_600_000), createdAt: old });
    const res = await sweepHookDeliveries();
    expect(res.purged).toBe(2);
    const remaining = (await prisma.hookDelivery.findMany()).map((d) => d.id).sort();
    expect(remaining).toEqual([keptRecent.id, keptFailed.id].sort());
    expect(remaining).not.toContain(purgedOk.id);
    expect(remaining).not.toContain(purgedDead.id);
  });

  it("honors RC_HOOK_DELIVERY_RETENTION_DAYS", async () => {
    vi.stubEnv("RC_HOOK_DELIVERY_RETENTION_DAYS", "7");
    const h = await seedHook();
    await delivery(h.id, { status: "OK", attempts: 1, nextAttemptAt: null, createdAt: new Date(Date.now() - 8 * 86_400_000) });
    const res = await sweepHookDeliveries();
    expect(res.purged).toBe(1);
  });
});

describe("startHookSweeper", () => {
  it("ticks on the interval, skips overlapping runs, and stops cleanly", async () => {
    vi.useFakeTimers();
    let resolveFirst!: () => void;
    const calls: number[] = [];
    const sweep = vi.fn(() => {
      calls.push(Date.now());
      return calls.length === 1 ? new Promise<void>((r) => { resolveFirst = r; }) : Promise.resolve();
    });
    const stop = startHookSweeper(1000, sweep);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // first run still in flight → skipped
    expect(sweep).toHaveBeenCalledTimes(1);
    resolveFirst();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sweep).toHaveBeenCalledTimes(2);
  });
});
