import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { register } from "@/lib/hooks/registry";
import { emitHooks, enqueueHooks, deliverDeliveries, CLAIM_LEASE_MS } from "@/lib/hooks/dispatch";
import type { Connector, HookEvent, HookEventKind } from "@/lib/hooks/types";
import type { DeployStatus } from "@prisma/client";

async function dispatchNow(eventId: string, kind: HookEventKind, actor?: string | null) {
  const { delivered } = await emitHooks(eventId, kind, actor);
  await delivered;
}

const sent: HookEvent[] = [];
const okConn: Connector = { type: "t-ok", async send(e) { sent.push(e); return { ok: true, statusCode: 200 }; } };
const boomConn: Connector = { type: "t-boom", async send() { throw new Error("kaboom"); } };
const capturedConfigs: Record<string, unknown>[] = [];
const captureConn: Connector = { type: "t-capture", async send(_e, config) { capturedConfigs.push(config); return { ok: true, statusCode: 200 }; } };
register(okConn);
register(boomConn);
register(captureConn);

async function setup(
  hooks: { type: string; events: string[]; enabled?: boolean; transitions?: string[]; targetId?: string }[],
  transition?: { from: DeployStatus; to: DeployStatus },
) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  const ev = await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" } });
  if (transition) {
    await prisma.statusTransition.create({
      // Later createdAt than the auto null→<status> transition createEvent records, so this
      // is unambiguously the latest (avoids a same-millisecond tie / flaky ordering).
      data: { eventId: ev.id, fromStatus: transition.from, toStatus: transition.to, actorName: "ci", createdAt: new Date(Date.now() + 60_000) },
    });
  }
  for (const h of hooks) {
    await prisma.hook.create({ data: { productId: p.id, type: h.type, events: h.events, transitions: h.transitions ?? [], config: {}, enabled: h.enabled ?? true, targetId: h.targetId } });
  }
  return ev;
}

beforeEach(async () => { await resetDb(); sent.length = 0; capturedConfigs.length = 0; });
afterAll(async () => { await prisma.$disconnect(); });

describe("dispatchHooks", () => {
  it("fires an enabled hook matching the kind and logs a delivery", async () => {
    const ev = await setup([{ type: "t-ok", events: ["deploy.created"] }]);
    await dispatchNow(ev.id, "deploy.created", "alice");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "deploy.created", product: "checkout", service: "api", environment: "PROD", actor: "alice" });
    const del = await prisma.hookDelivery.findMany();
    expect(del).toHaveLength(1);
    expect(del[0].status).toBe("OK");
    expect(del[0].statusCode).toBe(200);
  });
  it("matches a wildcard hook and skips a non-matching kind", async () => {
    const ev = await setup([{ type: "t-ok", events: ["*"] }, { type: "t-ok", events: ["incident.created"] }]);
    await dispatchNow(ev.id, "deploy.created");
    expect(sent).toHaveLength(1);
  });
  it("skips disabled hooks", async () => {
    const ev = await setup([{ type: "t-ok", events: ["*"], enabled: false }]);
    await dispatchNow(ev.id, "deploy.created");
    expect(sent).toHaveLength(0);
    expect(await prisma.hookDelivery.count()).toBe(0);
  });
  it("isolates a throwing connector and logs it as failed", async () => {
    const ev = await setup([{ type: "t-boom", events: ["*"] }, { type: "t-ok", events: ["*"] }]);
    await dispatchNow(ev.id, "deploy.created");
    expect(sent).toHaveLength(1);
    const del = await prisma.hookDelivery.findMany({ orderBy: { status: "asc" } });
    expect(del).toHaveLength(2);
    expect(del.find((d) => d.status !== "OK")?.error).toContain("kaboom");
  });
  it("logs an unknown connector type as failed and skips it", async () => {
    const ev = await setup([{ type: "ghost", events: ["*"] }]);
    await dispatchNow(ev.id, "deploy.created");
    const del = await prisma.hookDelivery.findMany();
    expect(del).toHaveLength(1);
    expect(del[0].status).toBe("DEAD");
    expect(del[0].error).toContain("connector");
  });
  it("fires a status_changed hook whose transitions filter matches", async () => {
    const ev = await setup(
      [{ type: "t-ok", events: ["deploy.status_changed"], transitions: ["DEPLOYED>TESTING"] }],
      { from: "DEPLOYED", to: "TESTING" },
    );
    await dispatchNow(ev.id, "deploy.status_changed");
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toMatchObject({ fromStatus: "DEPLOYED", toStatus: "TESTING" });
  });
  it("skips a status_changed hook whose transitions filter does not match", async () => {
    const ev = await setup(
      [{ type: "t-ok", events: ["deploy.status_changed"], transitions: ["DEPLOYED>TESTING"] }],
      { from: "IN_PROGRESS", to: "DEPLOYED" },
    );
    await dispatchNow(ev.id, "deploy.status_changed");
    expect(sent).toHaveLength(0);
  });
  it("fires a status_changed hook with an empty transitions filter on any transition", async () => {
    const ev = await setup(
      [{ type: "t-ok", events: ["deploy.status_changed"], transitions: [] }],
      { from: "IN_PROGRESS", to: "DEPLOYED" },
    );
    await dispatchNow(ev.id, "deploy.status_changed");
    expect(sent).toHaveLength(1);
  });
  it("does not apply the transitions filter to non-status_changed kinds", async () => {
    const ev = await setup([{ type: "t-ok", events: ["*"], transitions: ["DEPLOYED>TESTING"] }]);
    await dispatchNow(ev.id, "deploy.created");
    expect(sent).toHaveLength(1);
  });
  it("exposes a one-click actionUrl for a deployment with a next status", async () => {
    const ev = await setup([{ type: "t-ok", events: ["*"] }]);
    await dispatchNow(ev.id, "deploy.status_changed");
    const url = (sent[0].data as { actionUrl?: string }).actionUrl ?? "";
    expect(url).toContain("/go/");
    const { verifyActionToken } = await import("@/lib/actionToken");
    const tok = url.split("/go/")[1];
    expect(await verifyActionToken(tok)).toMatchObject({ eventId: ev.id, to: "TESTING" });
  });
  it("resolves a hook's config live from its NotificationTarget at send time", async () => {
    const target = await prisma.notificationTarget.create({
      data: { type: "webhook", label: "CI", config: { url: "https://target/x" } },
    });
    const ev = await setup([{ type: "t-capture", events: ["*"], targetId: target.id }]);
    await dispatchNow(ev.id, "deploy.created");
    expect(capturedConfigs).toHaveLength(1);
    expect(capturedConfigs[0]).toEqual({ url: "https://target/x" });
  });

  it("enqueueHooks writes PENDING rows without sending", async () => {
    const ev = await setup([{ type: "t-ok", events: ["*"] }]);
    const ids = await enqueueHooks(ev.id, "deploy.created");
    expect(ids).toHaveLength(1);
    expect(sent).toHaveLength(0);
    const row = await prisma.hookDelivery.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(row.nextAttemptAt).not.toBeNull();
  });

  it("a failed send schedules a retry: FAILED, attempts=1, nextAttemptAt in the future", async () => {
    const ev = await setup([{ type: "t-boom", events: ["*"] }]);
    await dispatchNow(ev.id, "deploy.created");
    const row = await prisma.hookDelivery.findFirstOrThrow();
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(row.error).toContain("kaboom");
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("an exhausted delivery goes DEAD, nextAttemptAt cleared", async () => {
    const ev = await setup([{ type: "t-boom", events: ["*"] }]);
    const ids = await enqueueHooks(ev.id, "deploy.created");
    await prisma.hookDelivery.update({
      where: { id: ids[0] },
      data: { status: "FAILED", attempts: 5, nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await deliverDeliveries(ids);
    const row = await prisma.hookDelivery.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(row).toMatchObject({ status: "DEAD", attempts: 6, nextAttemptAt: null });
  });

  it("two concurrent delivery attempts on one row send exactly once", async () => {
    let calls = 0;
    register({ type: "t-slow", async send() { calls++; await new Promise((r) => setTimeout(r, 50)); return { ok: true, statusCode: 200 }; } } as Connector);
    const ev = await setup([{ type: "t-slow", events: ["*"] }]);
    const ids = await enqueueHooks(ev.id, "deploy.created");
    await Promise.all([deliverDeliveries(ids), deliverDeliveries(ids)]);
    expect(calls).toBe(1);
    const row = await prisma.hookDelivery.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(row).toMatchObject({ status: "OK", attempts: 1 });
  });

  it("a claimed row is leased: not claimable again before the lease expires", async () => {
    const ev = await setup([{ type: "t-ok", events: ["*"] }]);
    const ids = await enqueueHooks(ev.id, "deploy.created");
    await deliverDeliveries(ids);
    // Simulate a crash mid-send: force back to PENDING with the lease timestamp.
    const leased = new Date(Date.now() + CLAIM_LEASE_MS - 1000);
    await prisma.hookDelivery.update({ where: { id: ids[0] }, data: { status: "PENDING", nextAttemptAt: leased } });
    sent.length = 0;
    await deliverDeliveries(ids); // due check fails → no send
    expect(sent).toHaveLength(0);
  });
});
