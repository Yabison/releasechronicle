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
    expect(json.items).toHaveLength(2);
    expect(json.items[0].version).toBe("2.0.0");
    expect(json.nextCursor).toBeNull();
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

const listReq = (qs: string) =>
  eventsGET(
    new Request(`http://x/api/v1/services/payment-api/events?company=acme&product=checkout${qs}`, { headers: AUTH }),
    { params: Promise.resolve({ slug: "payment-api" }) },
  );

describe("pagination", () => {
  it("caps the page at the default limit of 100 and hands back a cursor", async () => {
    const s = await seedService();
    for (let n = 0; n < 101; n++) {
      await deploy(s.id, { occurredAt: new Date(Date.UTC(2026, 0, 1, 0, n)) });
    }
    const json = await (await listReq("")).json();
    expect(json.items).toHaveLength(100);
    expect(json.nextCursor).toEqual(expect.any(String));
  });

  it("walks every page without overlap or gap, even across same-instant events", async () => {
    const s = await seedService();
    const sameInstant = new Date("2026-06-25T09:00:00Z");
    await deploy(s.id, { occurredAt: new Date("2026-06-25T11:00:00Z") });
    await deploy(s.id, { occurredAt: sameInstant });
    await deploy(s.id, { occurredAt: sameInstant });
    await deploy(s.id, { occurredAt: sameInstant });
    await deploy(s.id, { occurredAt: new Date("2026-06-25T07:00:00Z") });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const json = await (await listReq(`&limit=2${cursor ? `&cursor=${cursor}` : ""}`)).json();
      expect(json.items.length).toBeLessThanOrEqual(2);
      seen.push(...json.items.map((e: { id: string }) => e.id));
      cursor = json.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    // Full walk matches the unpaginated order exactly.
    const all = await (await listReq("")).json();
    expect(seen).toEqual(all.items.map((e: { id: string }) => e.id));
  });

  it("400 on a non-numeric, zero, negative or oversized limit", async () => {
    await seedService();
    for (const bad of ["abc", "0", "-1", "501", "2.5"]) {
      expect((await listReq(`&limit=${bad}`)).status).toBe(400);
    }
  });

  it("400 on a malformed cursor", async () => {
    await seedService();
    expect((await listReq("&cursor=garbage")).status).toBe(400);
  });

  it("filters by from/to timestamps", async () => {
    const s = await seedService();
    await deploy(s.id, { occurredAt: new Date("2026-06-01T00:00:00Z") });
    await deploy(s.id, { occurredAt: new Date("2026-06-15T00:00:00Z"), fields: { version: "1.5.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" } });
    await deploy(s.id, { occurredAt: new Date("2026-06-30T00:00:00Z") });
    const json = await (await listReq("&from=2026-06-10T00:00:00Z&to=2026-06-20T00:00:00Z")).json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].version).toBe("1.5.0");
  });

  it("400 on an unparseable from/to", async () => {
    await seedService();
    expect((await listReq("&from=yesterday")).status).toBe(400);
    expect((await listReq("&to=yesterday")).status).toBe(400);
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
