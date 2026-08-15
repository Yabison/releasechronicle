import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createIngestSource } from "@/lib/ingestSource";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn; } }));
import { POST } from "@/app/api/v1/ingest/deployments/route";

async function setup() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  const src = await createIngestSource({ scope: "SERVICE", serviceId: s.id, label: "ci", defaultEnvironment: "PROD" });
  return { serviceId: s.id, token: src.token };
}
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/ingest/deployments", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(async () => {
  await resetDb();
  // Membership is enforced against the active env table now; seed the uppercase
  // slug this suite's fixtures use (defaultEnvironment "PROD").
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
});
afterAll(async () => { await prisma.$disconnect(); });

describe("POST /api/v1/ingest/deployments", () => {
  it("401 without a token", async () => {
    await setup();
    expect((await POST(post({ version: "1" }))).status).toBe(401);
  });
  it("401 with an unknown token", async () => {
    await setup();
    expect((await POST(post({ version: "1" }, { authorization: "Bearer nope" }))).status).toBe(401);
  });
  it("creates a deployment on the source's service", async () => {
    const { serviceId, token } = await setup();
    const res = await POST(post({ version: "1.2.3" }, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(201);
    const ev = await res.json();
    expect(ev.serviceId).toBe(serviceId);
    expect(ev.version).toBe("1.2.3");
    expect(await prisma.event.count()).toBe(1);
  });
  it("accepts the token via ?token= query", async () => {
    const { token } = await setup();
    const req = new Request(`http://x/api/v1/ingest/deployments?token=${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "9" }) });
    expect((await POST(req)).status).toBe(201);
  });
  it("400 on missing version", async () => {
    const { token } = await setup();
    expect((await POST(post({}, { authorization: `Bearer ${token}` }))).status).toBe(400);
  });
});
