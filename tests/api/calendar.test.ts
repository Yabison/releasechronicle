import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { GET } from "@/app/api/v1/calendar.ics/route";
import { sessionCookie } from "../setup/session";
import { deleteService } from "@/lib/hierarchyDelete";

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  return s.id;
}
let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });
const get = (qs = "") => GET(new Request(`http://x/api/v1/calendar.ics${qs}`, { headers: AUTH }));

describe("GET /calendar.ics", () => {
  it("returns text/calendar with a VEVENT per deployment + maintenance", async () => {
    const serviceId = await seed();
    await createEvent({ serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.2.3", requester: "ci", changeType: "NORMAL", deployStatus: "SCHEDULED", lot: "L1", scheduledAt: new Date("2026-09-01T09:00:00Z") } });
    await createEvent({ serviceId, environment: "PROD", type: "MAINTENANCE", occurredAt: new Date("2026-09-02T22:00:00Z"), tags: [],
      fields: { version: null, windowStart: new Date("2026-09-02T22:00:00Z"), windowEnd: new Date("2026-09-02T23:00:00Z") } });

    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(body).toContain("DTSTART:20260901T090000Z"); // deployment uses scheduledAt
    expect(body).toContain("[MEP] checkout/api (PROD) 1.2.3");
    expect(body).toContain("DTSTART:20260902T220000Z"); // maintenance window start
    expect(body).toContain("DTEND:20260902T230000Z");
    expect(body).toContain("[Maintenance] checkout/api (PROD)");
  });
  it("scopes by environment", async () => {
    const serviceId = await seed();
    await prisma.environmentConfig.create({ data: { slug: "QA", name: "QA", color: "#3b82f6", sortOrder: 1 } });
    await createEvent({ serviceId, environment: "QA", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1" } });
    const body = await (await get("?environment=PROD")).text();
    expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(0);
  });
  it("excludes a soft-deleted service's deployments for a session", async () => {
    const serviceId = await seed();
    await createEvent({ serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.2.3", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "L1" } });
    await deleteService(serviceId);
    const body = await (await get()).text();
    expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(0);
  });
  it("excludes a soft-deleted service's deployments from the anonymous public feed", async () => {
    const c = await createCompany({ name: "Beta" });
    const p = await createProduct({ companyId: c.id, name: "Widgets" });
    const s = await createService({ productId: p.id, name: "API", type: "API" });
    await prisma.company.update({ where: { id: c.id }, data: { public: true } });
    await prisma.product.update({ where: { id: p.id }, data: { public: true } });
    await prisma.service.update({ where: { id: s.id }, data: { public: true } });
    await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0, public: true } });
    await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.2.3", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "L1" } });
    await deleteService(s.id);
    const body = await (await GET(new Request("http://x/api/v1/calendar.ics"))).text();
    expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(0);
  });
});
