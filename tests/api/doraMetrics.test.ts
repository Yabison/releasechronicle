import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { GET } from "@/app/api/v1/metrics/dora/route";
import { sessionCookie } from "../setup/session";

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return { s };
}
let AUTH: { cookie: string };
const get = (qs: string) => GET(new Request(`http://x/api/v1/metrics/dora?${qs}`, { headers: AUTH }));

beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("GET /metrics/dora", () => {
  it("computes metrics for the scoped events", async () => {
    const { s } = await seed();
    const dep = await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "IN_PROGRESS", lot: "1" } });
    await prisma.statusTransition.create({ data: { eventId: dep.id, fromStatus: "IN_PROGRESS", toStatus: "DEPLOYED", actorName: "ci" } });
    await prisma.rollback.create({ data: { eventId: dep.id, comment: "revert" } });

    const res = await get("company=acme&days=30");
    expect(res.status).toBe(200);
    const m = await res.json();
    expect(m.deploy.count).toBe(1);
    expect(m.changeFailure.failures).toBe(1);
    expect(m.changeFailure.total).toBe(1);
    expect(m.leadTime.sample).toBe(1);
    expect(m.windowDays).toBe(30);
  });

  it("defaults days to 30 and clamps invalid", async () => {
    await seed();
    const m = await (await get("company=acme")).json();
    expect(m.windowDays).toBe(30);
  });
});
