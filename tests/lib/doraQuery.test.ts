import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { queryDoraData } from "@/lib/doraQuery";
import { deleteService } from "@/lib/hierarchyDelete";

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return { c, p, s };
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("queryDoraData", () => {
  it("maps deployments (deployedAt from DEPLOYED transition, rolledBack) and incidents", async () => {
    const { s } = await seed();
    const dep = await createEvent({
      serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "IN_PROGRESS", lot: "1.0.0" },
    });
    await prisma.statusTransition.create({ data: { eventId: dep.id, fromStatus: "IN_PROGRESS", toStatus: "DEPLOYED", actorName: "ci" } });
    await prisma.rollback.create({ data: { eventId: dep.id, comment: "revert" } });
    await createEvent({
      serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), tags: [],
      fields: { incidentType: "outage", incidentStatus: "RESOLVED", startedAt: new Date(Date.now() - 3600_000), resolvedAt: new Date(), comment: null },
    });

    const r = await queryDoraData({ company: "acme", days: 30 });
    expect(r.deploys).toHaveLength(1);
    expect(r.deploys[0].deployedAt).not.toBeNull();
    expect(r.deploys[0].rolledBack).toBe(true);
    expect(r.incidents).toHaveLength(1);
    expect(r.incidents[0].resolvedAt).not.toBeNull();
    expect(r.windowDays).toBe(30);
  });

  it("excludes events older than the window", async () => {
    const { s } = await seed();
    await createEvent({
      serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(Date.now() - 40 * 86_400_000), tags: [],
      fields: { version: "0.1.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "0.1.0" },
    });
    const r = await queryDoraData({ company: "acme", days: 30 });
    expect(r.deploys).toHaveLength(0);
  });

  it("filters by environment", async () => {
    const { s } = await seed();
    await createEvent({ serviceId: s.id, environment: "QA", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1" } });
    expect((await queryDoraData({ company: "acme", environment: "PROD", days: 30 })).deploys).toHaveLength(0);
    expect((await queryDoraData({ company: "acme", environment: "QA", days: 30 })).deploys).toHaveLength(1);
  });

  it("excludes deployments and incidents of a soft-deleted service", async () => {
    const { s } = await seed();
    await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1" } });
    await createEvent({ serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), tags: [],
      fields: { incidentType: "outage", incidentStatus: "RESOLVED", startedAt: new Date(Date.now() - 3600_000), resolvedAt: new Date(), comment: null } });
    await deleteService(s.id);
    const r = await queryDoraData({ company: "acme", days: 30 });
    expect(r.deploys).toHaveLength(0);
    expect(r.incidents).toHaveLength(0);
  });

  it("excludes a soft-deleted service's events under publicScope too", async () => {
    const { c, p, s } = await seed();
    // Mark the whole chain public so publicScope's own filters don't already hide
    // the event for an unrelated reason — the only thing that should exclude it
    // here is the deletion.
    await prisma.company.update({ where: { id: c.id }, data: { public: true } });
    await prisma.product.update({ where: { id: p.id }, data: { public: true } });
    await prisma.service.update({ where: { id: s.id }, data: { public: true } });
    await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1" } });
    await deleteService(s.id);
    const r = await queryDoraData({ company: "acme", days: 30, publicScope: { envs: ["PROD"] } });
    expect(r.deploys).toHaveLength(0);
  });
});
