import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { POST } from "@/app/api/v1/maintenances/route";
import { PUT } from "@/app/api/v1/maintenances/[externalId]/route";

const AUTH = { authorization: "Bearer test-token" };

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  await createService({ productId: p.id, name: "Payment API", type: "API" });
}
function body(over: Record<string, unknown> = {}) {
  return {
    company: "acme", product: "checkout", service: "payment-api", environment: "PROD",
    windowStart: "2026-06-25T10:00:00Z", windowEnd: "2026-06-25T11:00:00Z", ...over,
  };
}
function post(b: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/maintenances", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b),
  });
}

beforeEach(async () => { await resetDb(); await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } }); });
afterAll(async () => { await prisma.$disconnect(); });

describe("POST /api/v1/maintenances", () => {
  it("rejects without a token", async () => { await seed(); expect((await POST(post(body()))).status).toBe(401); });
  it("creates a maintenance with occurredAt = windowStart", async () => {
    await seed();
    const res = await POST(post(body(), AUTH));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("MAINTENANCE");
    expect(json.occurredAt).toBe("2026-06-25T10:00:00.000Z");
  });
  it("400 when windowEnd is before windowStart", async () => {
    await seed();
    expect((await POST(post(body({ windowStart: "2026-06-25T11:00:00Z", windowEnd: "2026-06-25T10:00:00Z" }), AUTH))).status).toBe(400);
  });
  it("404 when the service is unresolved", async () => {
    await seed();
    expect((await POST(post(body({ product: "nope" }), AUTH))).status).toBe(404);
  });
});

describe("PUT /api/v1/maintenances/[externalId]", () => {
  it("upserts, one row", async () => {
    await seed();
    const mk = (b: unknown) => new Request("http://x/api/v1/maintenances/m-1", { method: "PUT", headers: { "content-type": "application/json", ...AUTH }, body: JSON.stringify(b) });
    const r1 = await PUT(mk(body()), { params: Promise.resolve({ externalId: "m-1" }) });
    expect(r1.status).toBe(200);
    const r2 = await PUT(mk(body({ windowEnd: "2026-06-25T12:00:00Z" })), { params: Promise.resolve({ externalId: "m-1" }) });
    expect(r2.status).toBe(200);
    expect((await r2.json()).windowEnd).toBe("2026-06-25T12:00:00.000Z");
    expect(await prisma.event.count()).toBe(1);
  });
});
