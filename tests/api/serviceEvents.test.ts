import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { GET as eventsGET } from "@/app/api/v1/services/[slug]/events/route";
import { GET as currentGET } from "@/app/api/v1/services/[slug]/current/route";
import { sessionCookie } from "../setup/session";

async function seedService() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return createService({ productId: p.id, name: "Payment API", type: "API" });
}
function deploy(serviceId: string, over: Record<string, unknown> = {}) {
  return createEvent({
    serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date("2026-06-25T09:00:00Z"),
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" }, ...over,
  } as never);
}

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("GET /api/v1/services/[slug]/events", () => {
  it("returns the feed to a session, newest first", async () => {
    const s = await seedService();
    await deploy(s.id, { occurredAt: new Date("2026-06-25T08:00:00Z") });
    await deploy(s.id, { occurredAt: new Date("2026-06-25T10:00:00Z"), fields: { version: "2.0.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" } });
    const res = await eventsGET(
      new Request("http://x/api/v1/services/payment-api/events?company=acme&product=checkout", { headers: AUTH }),
      { params: Promise.resolve({ slug: "payment-api" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].version).toBe("2.0.0");
  });
  it("404 when the service is unresolved", async () => {
    await seedService();
    const res = await eventsGET(
      new Request("http://x/api/v1/services/nope/events?company=acme&product=checkout"),
      { params: Promise.resolve({ slug: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
  it("400 when company/product params are missing", async () => {
    await seedService();
    const res = await eventsGET(
      new Request("http://x/api/v1/services/payment-api/events"),
      { params: Promise.resolve({ slug: "payment-api" }) },
    );
    expect(res.status).toBe(400);
  });
  it("400 on an invalid environment filter (no 500)", async () => {
    await seedService();
    const res = await eventsGET(
      new Request("http://x/api/v1/services/payment-api/events?company=acme&product=checkout&environment=STAGING", { headers: AUTH }),
      { params: Promise.resolve({ slug: "payment-api" }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/services/[slug]/current", () => {
  it("returns the latest version per environment", async () => {
    const s = await seedService();
    await deploy(s.id, { environment: "PROD", occurredAt: new Date("2026-06-25T08:00:00Z") });
    await deploy(s.id, { environment: "PROD", occurredAt: new Date("2026-06-25T10:00:00Z"), fields: { version: "2.0.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" } });
    await deploy(s.id, { environment: "QA", occurredAt: new Date("2026-06-25T09:00:00Z"), fields: { version: "3.0.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" } });
    const res = await currentGET(
      new Request("http://x/api/v1/services/payment-api/current?company=acme&product=checkout", { headers: AUTH }),
      { params: Promise.resolve({ slug: "payment-api" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.PROD.version).toBe("2.0.0");
    expect(json.QA.version).toBe("3.0.0");
  });
});
