import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService, softDeleteService, updateCompanyOrder } from "@/lib/hierarchy";
import { getSidebarTree } from "@/lib/tree";
import type { SessionUser } from "@/lib/auth/session";

// An authenticated viewer sees the full tree; anonymous (null) sees only public entities.
const AUTH: SessionUser = { sub: "u1", name: "Dev", roles: ["devops"] };

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedOne() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Payments" });
  const s = await createService({ productId: p.id, name: "Checkout", type: "API" });
  return { c, p, s };
}

describe("getSidebarTree", () => {
  it("nests companies → products → services", async () => {
    await seedOne();
    const tree = await getSidebarTree(AUTH);
    expect(tree).toHaveLength(1);
    expect(tree[0].products[0].services[0].name).toBe("Checkout");
  });

  it("counts events and upcoming maintenances per service", async () => {
    const { s } = await seedOne();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.event.create({ data: { serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date() } });
    // open incident (resolvedAt null) — counted as open
    await prisma.event.create({ data: { serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), startedAt: new Date() } });
    // resolved incident — not counted as open
    await prisma.event.create({ data: { serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: past, startedAt: past, resolvedAt: new Date() } });
    // upcoming maintenance (windowStart in the future) — counted
    await prisma.event.create({ data: { serviceId: s.id, environment: "PROD", type: "MAINTENANCE", occurredAt: future, windowStart: future, windowEnd: future } });
    // past maintenance — not counted
    await prisma.event.create({ data: { serviceId: s.id, environment: "PROD", type: "MAINTENANCE", occurredAt: past, windowStart: past, windowEnd: past } });
    const tree = await getSidebarTree(AUTH);
    const svc = tree[0].products[0].services[0];
    expect(svc.eventCount).toBe(5);
    expect(svc.upcomingMaintenanceCount).toBe(1);
    expect(svc.openIncidentCount).toBe(1);
  });

  it("orders companies by sortOrder (custom order overrides name)", async () => {
    const a = await createCompany({ name: "Alpha" }); // sortOrder 0
    await createCompany({ name: "Bravo" });           // sortOrder 1
    // Default: creation order = alphabetical here.
    expect((await getSidebarTree(AUTH)).map((c) => c.name)).toEqual(["Alpha", "Bravo"]);
    // Push Alpha after Bravo.
    await updateCompanyOrder(a.id, 5);
    expect((await getSidebarTree(AUTH)).map((c) => c.name)).toEqual(["Bravo", "Alpha"]);
  });

  it("orders products and services by sortOrder", async () => {
    const c = await createCompany({ name: "Acme" });
    const p1 = await createProduct({ companyId: c.id, name: "Beta" });  // sortOrder 0
    const p2 = await createProduct({ companyId: c.id, name: "Alpha" }); // sortOrder 1
    await createService({ productId: p1.id, name: "Zeta", type: "API" });   // 0
    await createService({ productId: p1.id, name: "Delta", type: "API" });  // 1
    const tree = await getSidebarTree(AUTH);
    // Products follow creation order (sortOrder), not name.
    expect(tree[0].products.map((p) => p.name)).toEqual(["Beta", "Alpha"]);
    expect(p2).toBeTruthy();
    // Services follow sortOrder (master-first still wins, none here).
    expect(tree[0].products[0].services.map((s) => s.name)).toEqual(["Zeta", "Delta"]);
  });

  it("excludes soft-deleted services", async () => {
    const { s } = await seedOne();
    await softDeleteService(s.id);
    const tree = await getSidebarTree(AUTH);
    expect(tree[0].products[0].services).toHaveLength(0);
  });

  it("anonymous sees nothing until the whole chain is public", async () => {
    const { c, p, s } = await seedOne();
    // Default: everything private -> anonymous tree is empty.
    expect(await getSidebarTree(null)).toHaveLength(0);
    // Marking only the service public is not enough (product + company still private).
    await prisma.service.update({ where: { id: s.id }, data: { public: true } });
    expect(await getSidebarTree(null)).toHaveLength(0);
    // Whole chain public -> visible to anonymous.
    await prisma.product.update({ where: { id: p.id }, data: { public: true } });
    await prisma.company.update({ where: { id: c.id }, data: { public: true } });
    const tree = await getSidebarTree(null);
    expect(tree).toHaveLength(1);
    expect(tree[0].products[0].services[0].name).toBe("Checkout");
  });

  it("anonymous event counts respect public event types", async () => {
    const { c, p, s } = await seedOne();
    await prisma.company.update({ where: { id: c.id }, data: { public: true } });
    await prisma.product.update({ where: { id: p.id }, data: { public: true } });
    await prisma.service.update({ where: { id: s.id }, data: { public: true } });
    await prisma.event.create({ data: { serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date() } });
    await prisma.event.create({ data: { serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), startedAt: new Date() } });
    // Default public types = DEPLOYMENT + MAINTENANCE -> the incident is not counted, and open-incident badge stays 0.
    const svc = (await getSidebarTree(null))[0].products[0].services[0];
    expect(svc.eventCount).toBe(1);
    expect(svc.openIncidentCount).toBe(0);
  });
});
