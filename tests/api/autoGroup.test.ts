import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { POST } from "@/app/api/v1/lots/auto-group/route";

const AUTH = { authorization: "Bearer test-token" };
beforeEach(async () => { await resetDb(); await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } }); });
afterAll(async () => { await prisma.$disconnect(); });

describe("POST /lots/auto-group", () => {
  it("requires the write token", async () => {
    expect((await POST(new Request("http://x", { method: "POST" }))).status).toBe(401);
  });
  it("groups eligible deployments", async () => {
    const c = await createCompany({ name: "Acme" });
    const p1 = await createProduct({ companyId: c.id, name: "A" });
    const p2 = await createProduct({ companyId: c.id, name: "B" });
    const s1 = await createService({ productId: p1.id, name: "API", type: "API" });
    const s2 = await createService({ productId: p2.id, name: "API", type: "API" });
    const base = new Date();
    for (const [sid, v] of [[s1.id, "1"], [s2.id, "2"]] as const) {
      await createEvent({ serviceId: sid, environment: "PROD", type: "DEPLOYMENT", occurredAt: base, tags: [],
        fields: { version: v, requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: v } });
    }
    const res = await POST(new Request("http://x", { method: "POST", headers: AUTH }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toBeGreaterThanOrEqual(1);
    const lots = new Set((await prisma.event.findMany()).map((e) => e.lot));
    expect(lots.size).toBe(1);
  });
});
