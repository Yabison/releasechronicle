/**
 * The notification half of promoteScheduledDeployments. Separate file from
 * scheduledPromote.test.ts because the enqueue is faked here at module scope,
 * and those tests need the real one.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

// The enqueue is the only step that can fail without the promotion itself
// failing, so it gets faked. Spread over importOriginal rather than listing the
// module's exports by hand: a hand-written factory keeps satisfying the import
// even after the real signature changes underneath it.
vi.mock("@/lib/hooks/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/dispatch")>();
  return { ...actual, emitHooks: vi.fn(async () => { throw new Error("enqueue exploded"); }) };
});

import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { promoteScheduledDeployments } from "@/lib/scheduledPromote";

async function dueDeployment() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({
    serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: {
      version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "GO_CONFIRMED", lot: "1.0.0",
      scheduledAt: new Date(Date.now() + 5 * 60_000),
    },
  });
}

/** One stray non-JSON line on the stream must not turn an assertion into a SyntaxError. */
function records(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

let err: string[];
beforeEach(async () => {
  await resetDb();
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  err = [];
  vi.spyOn(console, "error").mockImplementation((s: unknown) => { err.push(String(s)); });
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("promoteScheduledDeployments when the hook enqueue fails", () => {
  /**
   * The transition and the enqueue used to share one catch, so a failed enqueue
   * discarded a promotion that had already committed: `promoted` came back 0
   * while the row sat in PENDING, and the failure was indistinguishable from the
   * expected raced-underneath-us skip. Counting the row is the fix, and reverting
   * it turns this test red.
   */
  it("still counts the promotion — the deployment did move", async () => {
    const ev = await dueDeployment();
    const res = await promoteScheduledDeployments(new Date());
    expect(res.promoted).toBe(1);
    expect(res.ids).toEqual([ev.id]);
    const row = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(row.deployStatus).toBe("PENDING");
  });

  /** A cron job reading only the status code cannot tell this from a clean run. */
  it("reports the event in notifyFailed so the caller can tell the difference", async () => {
    const ev = await dueDeployment();
    const res = await promoteScheduledDeployments(new Date());
    expect(res.notifyFailed).toEqual([ev.id]);
  });

  it("says nobody was notified, naming the event", async () => {
    const ev = await dueDeployment();
    await promoteScheduledDeployments(new Date());
    const rec = records(err).find((r) => r.eventId === ev.id);
    expect(rec).toBeDefined();
    expect(rec?.level).toBe("error");
    expect(rec?.msg).toContain("hook enqueue failed");
    expect((rec?.err as { message: string }).message).toBe("enqueue exploded");
    expect(rec?.mod).toBe("scheduler");
  });
});
