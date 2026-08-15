import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

import { GET as companiesGET } from "@/app/api/v1/companies/route";
import { GET as productsGET } from "@/app/api/v1/products/route";
import { GET as servicesGET } from "@/app/api/v1/services/route";
import { GET as eventsGET } from "@/app/api/v1/services/[slug]/events/route";
import { GET as currentGET } from "@/app/api/v1/services/[slug]/current/route";
import { GET as envsGET } from "@/app/api/v1/environments/route";
import { GET as doraGET } from "@/app/api/v1/metrics/dora/route";
import { GET as candidatesGET } from "@/app/api/v1/lots/candidates/route";
import { GET as icsGET } from "@/app/api/v1/calendar.ics/route";

let AUTH: { cookie: string };
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (url: string, headers: Record<string, string> = {}) => new Request(`http://x${url}`, { headers });

/**
 * Two hierarchies: "shop" is public end to end, "secret" is not. PROD is a public
 * environment, STAGING is not. PublicSetting keeps its default of DEPLOYMENT +
 * MAINTENANCE, so an INCIDENT must stay hidden from anonymous callers.
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

  const deploy = (serviceId: string, environment: string, version: string) =>
    createEvent({
      serviceId, environment, type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version, requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: version },
    });

  await deploy(shopSvc.id, "PROD", "1.0.0");        // visible to everyone
  await deploy(shopSvc.id, "STAGING", "1.1.0");     // private environment
  await createEvent({                                // type not in the public set
    serviceId: shopSvc.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), tags: [],
    fields: { incidentType: "outage", incidentStatus: "INVESTIGATING", startedAt: new Date(), resolvedAt: null, comment: null },
  });
  await deploy(secretSvc.id, "PROD", "9.9.9");      // private hierarchy

  return { shopSvc, secretSvc };
}

beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("hierarchy listings", () => {
  it("hides non-public companies from an anonymous caller", async () => {
    await seed();
    const anon = await (await companiesGET(req("/api/v1/companies"))).json();
    expect(anon.map((c: { slug: string }) => c.slug)).toEqual(["shop"]);
  });
  it("shows every company to a session", async () => {
    await seed();
    const all = await (await companiesGET(req("/api/v1/companies", AUTH))).json();
    expect(all.map((c: { slug: string }) => c.slug).sort()).toEqual(["secret", "shop"]);
  });
  it("hides non-public products and services", async () => {
    await seed();
    expect(await (await productsGET(req("/api/v1/products?company=secret"))).json()).toEqual([]);
    expect(await (await servicesGET(req("/api/v1/services?company=secret&product=internal"))).json()).toEqual([]);
    const svcs = await (await servicesGET(req("/api/v1/services?company=shop&product=checkout"))).json();
    expect(svcs).toHaveLength(1);
  });
});

describe("service events", () => {
  it("404s on a private service instead of admitting it exists", async () => {
    await seed();
    const res = await eventsGET(req("/api/v1/services/core/events?company=secret&product=internal"), ctx("core"));
    expect(res.status).toBe(404);
  });
  it("returns only public types and environments on a public service", async () => {
    await seed();
    const rows = await (await eventsGET(req("/api/v1/services/api/events?company=shop&product=checkout"), ctx("api"))).json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ environment: "PROD", type: "DEPLOYMENT", version: "1.0.0" });
  });
  it("returns everything to a session", async () => {
    await seed();
    const rows = await (await eventsGET(req("/api/v1/services/api/events?company=shop&product=checkout", AUTH), ctx("api"))).json();
    expect(rows).toHaveLength(3);
    const secret = await (await eventsGET(req("/api/v1/services/core/events?company=secret&product=internal", AUTH), ctx("core"))).json();
    expect(secret).toHaveLength(1);
  });
  it("hides private-environment versions from /current", async () => {
    await seed();
    const anon = await (await currentGET(req("/api/v1/services/api/current?company=shop&product=checkout"), ctx("api"))).json();
    expect(Object.keys(anon)).toEqual(["PROD"]);
    const all = await (await currentGET(req("/api/v1/services/api/current?company=shop&product=checkout", AUTH), ctx("api"))).json();
    expect(Object.keys(all).sort()).toEqual(["PROD", "STAGING"]);
    expect((await currentGET(req("/api/v1/services/core/current?company=secret&product=internal"), ctx("core"))).status).toBe(404);
  });
});

describe("environments", () => {
  it("lists only public environments anonymously", async () => {
    await seed();
    const anon = await (await envsGET(req("/api/v1/environments"))).json();
    expect(anon.map((e: { slug: string }) => e.slug)).toEqual(["PROD"]);
    const all = await (await envsGET(req("/api/v1/environments", AUTH))).json();
    expect(all).toHaveLength(2);
  });
});

describe("DORA metrics", () => {
  it("counts only public deployments anonymously", async () => {
    await seed();
    const anon = await (await doraGET(req("/api/v1/metrics/dora?days=30"))).json();
    const all = await (await doraGET(req("/api/v1/metrics/dora?days=30", AUTH))).json();
    // Anonymous: the single public PROD deploy. Session: that one plus STAGING and
    // the private hierarchy's.
    expect(anon.deploy.count).toBe(1);
    expect(all.deploy.count).toBe(3);
  });
});

describe("calendar feed", () => {
  it("omits private services and environments from the public .ics", async () => {
    await seed();
    const body = await (await icsGET(req("/api/v1/calendar.ics"))).text();
    expect(body).toContain("1.0.0");
    expect(body).not.toContain("1.1.0");
    expect(body).not.toContain("9.9.9");
  });
  it("includes everything for a session", async () => {
    await seed();
    const body = await (await icsGET(req("/api/v1/calendar.ics", AUTH))).text();
    expect(body).toContain("9.9.9");
  });
});

describe("lot candidates", () => {
  it("needs a session — it only feeds the lot-creation UI, which requires write", async () => {
    await seed();
    expect((await candidatesGET(req("/api/v1/lots/candidates?company=shop&environment=PROD"))).status).toBe(401);
    expect((await candidatesGET(req("/api/v1/lots/candidates?company=shop&environment=PROD", AUTH))).status).toBe(200);
  });
});
