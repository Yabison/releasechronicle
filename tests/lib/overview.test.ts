import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { getOverview } from "@/lib/overview";

/**
 * Same world as the public-visibility API tests: "shop" is public end to end,
 * "secret" is not; PROD is public, STAGING is not. The dashboards feed straight
 * from getOverview, so these assertions are what keeps the home page from
 * leaking a private hierarchy to an anonymous demo visitor.
 */
async function seed() {
  await prisma.environmentConfig.createMany({
    data: [
      { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0, public: true },
      { slug: "STAGING", name: "STAGING", color: "#eab308", sortOrder: 1, public: false },
    ],
  });
  const shop = await createCompany({ name: "Shop" });
  const shopProd = await createProduct({ companyId: shop.id, name: "Checkout" });
  const shopSvc = await createService({ productId: shopProd.id, name: "API", type: "API" });
  await prisma.company.update({ where: { id: shop.id }, data: { public: true } });
  await prisma.product.update({ where: { id: shopProd.id }, data: { public: true } });
  await prisma.service.update({ where: { id: shopSvc.id }, data: { public: true } });

  const secret = await createCompany({ name: "Secret" });
  const secretProd = await createProduct({ companyId: secret.id, name: "Internal" });
  const secretSvc = await createService({ productId: secretProd.id, name: "Core", type: "API" });

  const deploy = (serviceId: string, environment: string, version: string, deployStatus = "VALIDATE") =>
    createEvent({
      serviceId, environment, type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version, requester: "ci", changeType: "NORMAL", deployStatus, lot: null },
    });

  await deploy(shopSvc.id, "PROD", "1.0.0");
  await deploy(shopSvc.id, "STAGING", "1.1.0");          // private env
  await deploy(shopSvc.id, "PROD", "1.2.0", "TESTING");  // in flight
  await deploy(secretSvc.id, "PROD", "9.9.9");           // private hierarchy

  await createEvent({                                     // open incident, public service
    serviceId: shopSvc.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), tags: [],
    fields: { incidentType: "outage", incidentStatus: "INVESTIGATING", startedAt: new Date(), resolvedAt: null, comment: "down" },
  });
  await createEvent({                                     // upcoming maintenance
    serviceId: shopSvc.id, environment: "PROD", type: "MAINTENANCE", occurredAt: new Date(Date.now() + 86_400_000), tags: [],
    fields: { version: null, windowStart: new Date(Date.now() + 86_400_000), windowEnd: new Date(Date.now() + 90_000_000) },
  });

  return { shopSvc, secretSvc };
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("getOverview — session", () => {
  it("counts and lists across every company", async () => {
    await seed();
    const o = await getOverview({}, false);
    expect(o.counters.openIncidents).toBe(1);
    expect(o.counters.upcomingMaintenances).toBe(1);
    expect(o.recentDeployments.map((d) => d.version)).toContain("9.9.9");
    expect(o.recentDeployments.map((d) => d.version)).toContain("1.1.0");
    expect(o.inFlight.map((d) => d.version)).toEqual(["1.2.0"]);
  });
  it("scopes to a company", async () => {
    await seed();
    const o = await getOverview({ company: "secret" }, false);
    expect(o.recentDeployments.map((d) => d.version)).toEqual(["9.9.9"]);
    expect(o.counters.openIncidents).toBe(0);
  });
  it("scopes to a product", async () => {
    await seed();
    const o = await getOverview({ company: "shop", product: "checkout" }, false);
    expect(o.recentDeployments.length).toBe(3);
    expect(o.recentDeployments[0].company.slug).toBe("shop");
    expect(o.recentDeployments[0].service.slug).toBe("api");
  });
});

describe("getOverview — anonymous", () => {
  it("hides private hierarchies, private environments, and non-public types", async () => {
    await seed();
    const o = await getOverview({}, true);
    const versions = o.recentDeployments.map((d) => d.version);
    expect(versions).toContain("1.0.0");
    expect(versions).not.toContain("1.1.0"); // STAGING is private
    expect(versions).not.toContain("9.9.9"); // secret/ is private
    // Default public types are DEPLOYMENT + MAINTENANCE: the incident stays hidden.
    expect(o.openIncidents).toEqual([]);
    expect(o.counters.openIncidents).toBe(0);
    expect(o.counters.upcomingMaintenances).toBe(1);
  });
});
