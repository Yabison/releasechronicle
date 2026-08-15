import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createIngestSource, findIngestSourceByToken } from "@/lib/ingestSource";
import { ingestDeployment } from "@/lib/ingestDeployment";

async function source(defEnv: "PROD" | "QA" = "PROD") {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  const src = await createIngestSource({ scope: "SERVICE", serviceId: s.id, label: "ci", defaultEnvironment: defEnv });
  return { serviceId: s.id, src };
}
beforeEach(async () => {
  await resetDb();
  // Membership is enforced against the active env table now; seed the uppercase
  // slugs this suite's fixtures use (defaultEnvironment/body "PROD"/"QA").
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  await prisma.environmentConfig.create({ data: { slug: "QA", name: "QA", color: "#3b82f6", sortOrder: 1 } });
});
afterAll(async () => { await prisma.$disconnect(); });

describe("ingestDeployment", () => {
  it("creates a deployment on the source's service with defaults", async () => {
    const { serviceId, src } = await source("QA");
    const r = await ingestDeployment(src, { version: "1.2.3" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.event.serviceId).toBe(serviceId);
    expect(r.event.type).toBe("DEPLOYMENT");
    expect(r.event.environment).toBe("QA");
    expect(r.event.version).toBe("1.2.3");
    expect(r.event.requester).toBe("ci");
    expect(r.event.changeType).toBe("NORMAL");
    expect(r.event.deployStatus).toBe("DEPLOYED");
    expect(r.event.lot).toBe("1.2.3");
  });
  it("honors an explicit environment and fields", async () => {
    const { src } = await source("QA");
    const r = await ingestDeployment(src, { version: "2.0.0", environment: "PROD", requester: "gh", changeType: "HOTFIX", lot: "rel-9" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.event.environment).toBe("PROD");
    expect(r.event.requester).toBe("gh");
    expect(r.event.changeType).toBe("HOTFIX");
    expect(r.event.lot).toBe("rel-9");
  });
  it("rejects a missing version", async () => {
    const { src } = await source();
    const r = await ingestDeployment(src, {});
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it("rejects a bad environment / changeType enum", async () => {
    const { src } = await source();
    expect((await ingestDeployment(src, { version: "1", environment: "NOPE" }))).toMatchObject({ ok: false, status: 400 });
    expect((await ingestDeployment(src, { version: "1", changeType: "BOGUS" }))).toMatchObject({ ok: false, status: 400 });
  });
  it("creates a SCHEDULED deployment when scheduledAt is provided", async () => {
    const { src } = await source("QA");
    const r = await ingestDeployment(src, { version: "1.0.0", deployStatus: "SCHEDULED", scheduledAt: "2026-08-01T10:00:00Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.event.deployStatus).toBe("SCHEDULED");
    expect(r.event.scheduledAt).not.toBeNull();
    expect(r.event.scheduledAt?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });
  it("rejects SCHEDULED deployStatus without scheduledAt", async () => {
    const { src } = await source("QA");
    const r = await ingestDeployment(src, { version: "1.0.0", deployStatus: "SCHEDULED" });
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (r.ok) throw new Error("expected fail");
    expect(r.error).toMatch(/scheduledAt/);
  });
  it("rejects an environment string with no matching active env row (membership check)", async () => {
    const { src } = await source();
    // "STAGING" is a syntactically valid, non-empty environment slug — the pure
    // validator would accept it — but no environmentConfig row exists for it.
    const r = await ingestDeployment(src, { version: "1", environment: "STAGING" });
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (r.ok) throw new Error("expected fail");
    expect(r.error).toMatch(/unknown environment/i);
    // Once the env is registered, the same request succeeds.
    await prisma.environmentConfig.create({ data: { slug: "STAGING", name: "STAGING", color: "#f59e0b", sortOrder: 2 } });
    const r2 = await ingestDeployment(src, { version: "1", environment: "STAGING" });
    expect(r2.ok).toBe(true);
  });
});

async function hierarchy() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return { c, p, s };
}

describe("ingestDeployment — company scope", () => {
  it("resolves the service from body product+service within the company", async () => {
    const { c, s } = await hierarchy();
    const made = await createIngestSource({ scope: "COMPANY", companyId: c.id, label: "ci", defaultEnvironment: "PROD" });
    const src = await findIngestSourceByToken(made.token);
    const r = await ingestDeployment(src!, { version: "9.9.9", product: "checkout", service: "api" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.event.serviceId).toBe(s.id);
  });
  it("400 when product/service missing", async () => {
    const { c } = await hierarchy();
    const made = await createIngestSource({ scope: "COMPANY", companyId: c.id, label: "ci", defaultEnvironment: "PROD" });
    const src = await findIngestSourceByToken(made.token);
    const r = await ingestDeployment(src!, { version: "1.0.0" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.status).toBe(400);
  });
  it("404 when the service is not in the token's company", async () => {
    const { c } = await hierarchy();
    const c2 = await createCompany({ name: "Beta" });
    const p2 = await createProduct({ companyId: c2.id, name: "Other" });
    await createService({ productId: p2.id, name: "API", type: "API" });
    const made = await createIngestSource({ scope: "COMPANY", companyId: c.id, label: "ci", defaultEnvironment: "PROD" });
    const src = await findIngestSourceByToken(made.token);
    const r = await ingestDeployment(src!, { version: "1.0.0", product: "other", service: "api" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.status).toBe(404);
  });
});

describe("ingestDeployment — global scope", () => {
  it("resolves the service from body company+product+service", async () => {
    const { s } = await hierarchy();
    const made = await createIngestSource({ scope: "GLOBAL", label: "ci", defaultEnvironment: "PROD" });
    const src = await findIngestSourceByToken(made.token);
    const r = await ingestDeployment(src!, { version: "2.0.0", company: "acme", product: "checkout", service: "api" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.event.serviceId).toBe(s.id);
  });
  it("400 when company/product/service missing", async () => {
    await hierarchy();
    const made = await createIngestSource({ scope: "GLOBAL", label: "ci", defaultEnvironment: "PROD" });
    const src = await findIngestSourceByToken(made.token);
    const r = await ingestDeployment(src!, { version: "1.0.0", product: "checkout", service: "api" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.status).toBe(400);
  });
});

describe("ingestDeployment — ALL (no default env)", () => {
  it("requires body environment when the source has no default", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({ productId: p.id, name: "API", type: "API" });
    const src = await createIngestSource({ scope: "SERVICE", serviceId: s.id, label: "ci", defaultEnvironment: null });
    const r1 = await ingestDeployment(src, { version: "1.0.0" });
    expect(r1.ok).toBe(false);
    if (r1.ok) throw new Error("expected fail");
    expect(r1.status).toBe(400);
    const r2 = await ingestDeployment(src, { version: "1.0.0", environment: "QA" });
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error("expected ok");
    expect(r2.event.environment).toBe("QA");
  });
});
