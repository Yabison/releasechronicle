import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { listCausalCandidates, wouldCreateCycle, getCausalSummaries } from "@/lib/causal";

async function seedProduct(companyName = "Acme", productName = "Checkout") {
  const c = await createCompany({ name: companyName });
  const p = await createProduct({ companyId: c.id, name: productName });
  return { c, p };
}

function deployData(serviceId: string, occurredAt: Date, version = "1.0.0") {
  return {
    serviceId, environment: "PROD" as const, type: "DEPLOYMENT" as const, occurredAt, tags: [],
    fields: { version, requester: "ci", changeType: "NORMAL" as const, deployStatus: "DEPLOYED" as const },
  };
}

function incidentData(serviceId: string, occurredAt: Date) {
  return {
    serviceId, environment: "PROD" as const, type: "INCIDENT" as const, occurredAt, tags: [],
    fields: { incidentType: "outage", startedAt: occurredAt, resolvedAt: null, comment: null },
  };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("listCausalCandidates", () => {
  it("scopes candidates to the same product, across services", async () => {
    const { p } = await seedProduct();
    const serviceA = await createService({ productId: p.id, name: "A", type: "API" });
    const serviceB = await createService({ productId: p.id, name: "B", type: "API" });
    const dep = await createEvent(deployData(serviceB.id, new Date("2026-08-01T10:00:00Z")));
    const inc = await createEvent(incidentData(serviceA.id, new Date("2026-08-01T12:00:00Z")));
    const candidates = await listCausalCandidates(inc.id);
    expect(candidates.map((c) => c.id)).toContain(dep.id);
  });

  it("excludes events from a different product, even in the same company", async () => {
    const c = await createCompany({ name: "Acme" });
    const p1 = await createProduct({ companyId: c.id, name: "Checkout" });
    const p2 = await createProduct({ companyId: c.id, name: "Billing" });
    const s1 = await createService({ productId: p1.id, name: "A", type: "API" });
    const s2 = await createService({ productId: p2.id, name: "B", type: "API" });
    const other = await createEvent(deployData(s2.id, new Date("2026-08-01T10:00:00Z")));
    const inc = await createEvent(incidentData(s1.id, new Date("2026-08-01T12:00:00Z")));
    const candidates = await listCausalCandidates(inc.id);
    expect(candidates.map((c) => c.id)).not.toContain(other.id);
  });

  it("excludes the event itself", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const ev = await createEvent(deployData(s.id, new Date("2026-08-01T10:00:00Z")));
    const candidates = await listCausalCandidates(ev.id);
    expect(candidates.map((c) => c.id)).not.toContain(ev.id);
  });

  it("respects the time window: default 30 days before the target's occurredAt", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const old = await createEvent(deployData(s.id, new Date("2026-06-01T10:00:00Z"))); // >30d before target
    const recent = await createEvent(deployData(s.id, new Date("2026-07-20T10:00:00Z"))); // within 30d
    const inc = await createEvent(incidentData(s.id, new Date("2026-08-05T10:00:00Z")));
    const candidates = await listCausalCandidates(inc.id);
    expect(candidates.map((c) => c.id)).toContain(recent.id);
    expect(candidates.map((c) => c.id)).not.toContain(old.id);
  });

  it("orders candidates newest first", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const first = await createEvent(deployData(s.id, new Date("2026-08-01T08:00:00Z")));
    const second = await createEvent(deployData(s.id, new Date("2026-08-02T08:00:00Z")));
    const inc = await createEvent(incidentData(s.id, new Date("2026-08-03T08:00:00Z")));
    const candidates = await listCausalCandidates(inc.id);
    expect(candidates.map((c) => c.id)).toEqual([second.id, first.id]);
  });
});

describe("wouldCreateCycle", () => {
  it("detects a direct cycle: A is caused by B, so B caused by A would cycle", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const a = await createEvent(deployData(s.id, new Date("2026-08-01T08:00:00Z")));
    const b = await createEvent(deployData(s.id, new Date("2026-08-02T08:00:00Z")));
    await prisma.event.update({ where: { id: a.id }, data: { causedById: b.id } });
    expect(await wouldCreateCycle(b.id, a.id)).toBe(true);
  });

  it("returns false when there is no cycle", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const a = await createEvent(deployData(s.id, new Date("2026-08-01T08:00:00Z")));
    const b = await createEvent(deployData(s.id, new Date("2026-08-02T08:00:00Z")));
    expect(await wouldCreateCycle(b.id, a.id)).toBe(false);
  });

  it("terminates and treats a chain longer than the depth cap as a cycle", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    // Build a chain of 25 events, each caused by the previous one, then close the
    // loop -- already-corrupted data that would otherwise walk forever.
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const ev = await createEvent(deployData(s.id, new Date(2026, 7, 1 + i)));
      ids.push(ev.id);
    }
    for (let i = 1; i < ids.length; i++) {
      await prisma.event.update({ where: { id: ids[i] }, data: { causedById: ids[i - 1] } });
    }
    await prisma.event.update({ where: { id: ids[0] }, data: { causedById: ids[ids.length - 1] } });
    const outsider = await createEvent(deployData(s.id, new Date("2026-09-01T08:00:00Z")));
    // Never reaches `outsider` nor a null terminator: the cap must stop the walk.
    expect(await wouldCreateCycle(outsider.id, ids[0])).toBe(true);
  });
});

describe("getCausalSummaries", () => {
  it("resolves a same-service cause", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const cause = await createEvent(deployData(s.id, new Date("2026-08-01T10:00:00Z")));
    const effect = await createEvent(incidentData(s.id, new Date("2026-08-01T12:00:00Z")));
    await prisma.event.update({ where: { id: effect.id }, data: { causedById: cause.id } });

    const map = await getCausalSummaries([{ id: effect.id, causedById: cause.id }]);
    const summary = map.get(effect.id);
    expect(summary?.causedBy?.id).toBe(cause.id);
    expect(summary?.causedBy?.serviceSlug).toBe(s.slug);
  });

  it("resolves a cross-service, same-product cause, including its serviceSlug", async () => {
    const { p } = await seedProduct();
    const serviceA = await createService({ productId: p.id, name: "Incidents", type: "API" });
    const serviceB = await createService({ productId: p.id, name: "Deploys", type: "API" });
    const cause = await createEvent(deployData(serviceB.id, new Date("2026-08-01T10:00:00Z")));
    const effect = await createEvent(incidentData(serviceA.id, new Date("2026-08-01T12:00:00Z")));
    await prisma.event.update({ where: { id: effect.id }, data: { causedById: cause.id } });

    // The displayed set is only serviceA's own event -- exactly the shape the
    // per-service page would pass in. The cause lives on serviceB and must still
    // resolve, unlike the old array-lookup approach.
    const map = await getCausalSummaries([{ id: effect.id, causedById: cause.id }]);
    const summary = map.get(effect.id);
    expect(summary?.causedBy?.id).toBe(cause.id);
    expect(summary?.causedBy?.serviceSlug).toBe(serviceB.slug);
  });

  it("returns the led entries for a cause among the displayed events", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const cause = await createEvent(deployData(s.id, new Date("2026-08-01T10:00:00Z")));
    const effect = await createEvent(incidentData(s.id, new Date("2026-08-01T12:00:00Z")));
    await prisma.event.update({ where: { id: effect.id }, data: { causedById: cause.id } });

    const map = await getCausalSummaries([{ id: cause.id, causedById: null }]);
    const summary = map.get(cause.id);
    expect(summary?.led.map((l) => l.id)).toEqual([effect.id]);
  });

  it("excludes a soft-deleted cause", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const cause = await createEvent(deployData(s.id, new Date("2026-08-01T10:00:00Z")));
    const effect = await createEvent(incidentData(s.id, new Date("2026-08-01T12:00:00Z")));
    await prisma.event.update({ where: { id: effect.id }, data: { causedById: cause.id } });
    await prisma.event.update({ where: { id: cause.id }, data: { deletedAt: new Date() } });

    const map = await getCausalSummaries([{ id: effect.id, causedById: cause.id }]);
    expect(map.get(effect.id)?.causedBy).toBeUndefined();
  });

  it("excludes a soft-deleted led event", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const cause = await createEvent(deployData(s.id, new Date("2026-08-01T10:00:00Z")));
    const effect = await createEvent(incidentData(s.id, new Date("2026-08-01T12:00:00Z")));
    await prisma.event.update({ where: { id: effect.id }, data: { causedById: cause.id } });
    await prisma.event.update({ where: { id: effect.id }, data: { deletedAt: new Date() } });

    const map = await getCausalSummaries([{ id: cause.id, causedById: null }]);
    expect(map.get(cause.id)?.led).toEqual([]);
  });

  it("returns an empty summary for an event with no links", async () => {
    const { p } = await seedProduct();
    const s = await createService({ productId: p.id, name: "A", type: "API" });
    const ev = await createEvent(deployData(s.id, new Date("2026-08-01T10:00:00Z")));

    const map = await getCausalSummaries([{ id: ev.id, causedById: null }]);
    const summary = map.get(ev.id);
    expect(summary?.causedBy).toBeUndefined();
    expect(summary?.led).toEqual([]);
  });
});
