import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { POST as rollbackPOST } from "@/app/api/v1/deployments/by-id/[id]/rollback/route";
import { POST as qaPOST } from "@/app/api/v1/deployments/by-id/[id]/qa/route";

const AUTH = { authorization: "Bearer test-token" };

async function seedService() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return createService({ productId: p.id, name: "Payment API", type: "API" });
}
function deployment(serviceId: string) {
  return createEvent({
    serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(),
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" },
  } as never);
}
function incident(serviceId: string) {
  return createEvent({
    serviceId, environment: "PROD", type: "INCIDENT", occurredAt: new Date(),
    fields: { incidentType: "outage", startedAt: new Date(), resolvedAt: null, comment: null },
  } as never);
}
function req(id: string, b: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/deployments/by-id/${id}/rollback`, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b),
  });
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("POST rollback", () => {
  it("rejects without a token", async () => {
    const s = await seedService();
    const d = await deployment(s.id);
    const res = await rollbackPOST(req(d.id, { comment: "x" }), { params: Promise.resolve({ id: d.id }) });
    expect(res.status).toBe(401);
  });
  it("201 attaches a rollback to a deployment", async () => {
    const s = await seedService();
    const d = await deployment(s.id);
    const res = await rollbackPOST(req(d.id, { comment: "reverted", link: "http://x" }, AUTH), { params: Promise.resolve({ id: d.id }) });
    expect(res.status).toBe(201);
    expect(await prisma.rollback.count()).toBe(1);
  });
  it("400 when comment is missing", async () => {
    const s = await seedService();
    const d = await deployment(s.id);
    const res = await rollbackPOST(req(d.id, {}, AUTH), { params: Promise.resolve({ id: d.id }) });
    expect(res.status).toBe(400);
  });
  it("404 when the event does not exist", async () => {
    await seedService();
    const res = await rollbackPOST(req("missing", { comment: "x" }, AUTH), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });
  it("422 when the event is not a deployment", async () => {
    const s = await seedService();
    const inc = await incident(s.id);
    const res = await rollbackPOST(req(inc.id, { comment: "x" }, AUTH), { params: Promise.resolve({ id: inc.id }) });
    expect(res.status).toBe(422);
  });
});

describe("POST qa", () => {
  it("201 attaches a qa validation", async () => {
    const s = await seedService();
    const d = await deployment(s.id);
    const r = new Request(`http://x/api/v1/deployments/by-id/${d.id}/qa`, {
      method: "POST", headers: { "content-type": "application/json", ...AUTH }, body: JSON.stringify({ validatedBy: "qa-bot" }),
    });
    const res = await qaPOST(r, { params: Promise.resolve({ id: d.id }) });
    expect(res.status).toBe(201);
    expect(await prisma.qaValidation.count()).toBe(1);
  });
});
