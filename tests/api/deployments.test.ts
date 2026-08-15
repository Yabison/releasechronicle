import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { POST } from "@/app/api/v1/deployments/route";
import { PUT } from "@/app/api/v1/deployments/[externalId]/route";

const AUTH = { authorization: "Bearer test-token" };

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  await createService({ productId: p.id, name: "Payment API", type: "API" });
}
function body(over: Record<string, unknown> = {}) {
  return {
    company: "acme", product: "checkout", service: "payment-api", environment: "PROD",
    version: "1.0.0", requester: "ci", changeType: "NORMAL", ...over,
  };
}
function post(b: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/deployments", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b),
  });
}

beforeEach(async () => { await resetDb(); await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } }); });
afterAll(async () => { await prisma.$disconnect(); });

describe("POST /api/v1/deployments", () => {
  it("rejects without a token", async () => {
    await seed();
    expect((await POST(post(body()))).status).toBe(401);
  });
  it("creates a deployment", async () => {
    await seed();
    const res = await POST(post(body(), AUTH));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("DEPLOYMENT");
    expect(json.version).toBe("1.0.0");
  });
  it("400 on invalid changeType", async () => {
    await seed();
    expect((await POST(post(body({ changeType: "WAT" }), AUTH))).status).toBe(400);
  });
  it("404 when the service path is unresolved", async () => {
    await seed();
    expect((await POST(post(body({ service: "nope" }), AUTH))).status).toBe(404);
  });
});

describe("PUT /api/v1/deployments/[externalId]", () => {
  function putReq(extId: string, b: unknown, headers: Record<string, string> = {}) {
    return new Request(`http://x/api/v1/deployments/${extId}`, {
      method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b),
    });
  }
  it("upserts idempotently (200, one row, latest wins)", async () => {
    await seed();
    const r1 = await PUT(putReq("dep-1", body(), AUTH), { params: Promise.resolve({ externalId: "dep-1" }) });
    expect(r1.status).toBe(200);
    const r2 = await PUT(putReq("dep-1", body({ version: "2.0.0" }), AUTH), { params: Promise.resolve({ externalId: "dep-1" }) });
    expect(r2.status).toBe(200);
    expect((await r2.json()).version).toBe("2.0.0");
    expect(await prisma.event.count()).toBe(1);
  });
  it("rejects without a token", async () => {
    await seed();
    const res = await PUT(putReq("dep-1", body()), { params: Promise.resolve({ externalId: "dep-1" }) });
    expect(res.status).toBe(401);
  });
});
