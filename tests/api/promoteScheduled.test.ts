import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { POST } from "@/app/api/v1/deployments/promote-scheduled/route";

const AUTH = { authorization: "Bearer test-token" };
beforeEach(async () => { await resetDb(); await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } }); });
afterAll(async () => { await prisma.$disconnect(); });
const req = (h: Record<string, string> = {}) => new Request("http://x/api/v1/deployments/promote-scheduled", { method: "POST", headers: h });

describe("POST /deployments/promote-scheduled", () => {
  it("requires the write token", async () => {
    expect((await POST(req())).status).toBe(401);
  });
  it("promotes a due SCHEDULED deploy", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({ productId: p.id, name: "API", type: "API" });
    await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1", requester: "ci", changeType: "NORMAL", deployStatus: "GO_CONFIRMED", lot: "1", scheduledAt: new Date(Date.now() + 5 * 60_000) } });
    const res = await POST(req(AUTH));
    expect(res.status).toBe(200);
    expect((await res.json()).promoted).toBe(1);
  });
});
