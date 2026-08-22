import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { register } from "@/lib/hooks/registry";
import { deliverDeliveries, CLAIM_LEASE_MS } from "@/lib/hooks/dispatch";
import type { Connector } from "@/lib/hooks/types";

let sends = 0;
register({ type: "t-outcome", async send() { sends++; return { ok: true, statusCode: 200 }; } } as Connector);

const payload = {
  kind: "deploy.created", occurredAt: new Date().toISOString(), company: "acme", product: "checkout",
  service: "api", environment: "PROD", actor: null, data: {},
};

async function duePending() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  await createService({ productId: p.id, name: "API", type: "API" });
  const h = await prisma.hook.create({ data: { productId: p.id, type: "t-outcome", events: ["*"], config: {}, enabled: true } });
  return prisma.hookDelivery.create({
    data: { hookId: h.id, kind: "deploy.created", payload, status: "PENDING", attempts: 0, nextAttemptAt: new Date(Date.now() - 1000) } as never,
  });
}

/** One stray non-JSON line on the stream must not turn an assertion into a SyntaxError. */
function records(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

let err: string[];
beforeEach(async () => {
  await resetDb();
  sends = 0;
  err = [];
  vi.spyOn(console, "error").mockImplementation((s: unknown) => { err.push(String(s)); });
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await prisma.$disconnect(); });

/**
 * The window between the exclusive claim and the write that records the outcome.
 * A database failure in there used to leave a leased row, an incremented attempt
 * count and no trace anywhere — the delivery recovered when the lease expired,
 * but from the outside it looked exactly like nothing having happened. Only the
 * outcome write is broken here (`update`); the claim uses `updateMany`, so this
 * reproduces the window rather than a failure before it.
 */
describe("a delivery whose outcome cannot be written", () => {
  it("logs the delivery id and when the row falls due again", async () => {
    const d = await duePending();
    vi.spyOn(prisma.hookDelivery, "update").mockRejectedValue(new Error("db went away"));

    await deliverDeliveries([d.id]);

    expect(sends).toBe(1); // the send itself succeeded: we are past the claim
    const rec = records(err).find((r) => r.deliveryId === d.id);
    expect(rec).toBeDefined();
    expect(rec?.level).toBe("error");
    expect(rec?.mod).toBe("hooks");
    expect((rec?.err as { message: string }).message).toBe("db went away");
    expect(Date.parse(rec?.dueAgainAt as string)).toBeGreaterThan(Date.now());
  });

  it("leaves the row claimed so the lease can hand it to a later pass", async () => {
    const d = await duePending();
    vi.spyOn(prisma.hookDelivery, "update").mockRejectedValue(new Error("db went away"));

    await deliverDeliveries([d.id]);

    const row = await prisma.hookDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + CLAIM_LEASE_MS - 60_000);
  });

  it("does not reject, so one broken row cannot take down its batch", async () => {
    const d = await duePending();
    vi.spyOn(prisma.hookDelivery, "update").mockRejectedValue(new Error("db went away"));
    await expect(deliverDeliveries([d.id])).resolves.toBeUndefined();
  });
});
