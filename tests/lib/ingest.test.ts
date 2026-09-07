import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { deploymentBodySchema } from "@/lib/schemas/event";
import { persistValidatedEvent, ServiceNotFoundError } from "@/lib/ingest";
import { createEvent } from "@/lib/events";

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

beforeEach(async () => { await resetDb(); await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } }); });
afterAll(async () => { await prisma.$disconnect(); });

describe("persistValidatedEvent", () => {
  it("creates an event when the service resolves", async () => {
    await seed();
    const v = deploymentBodySchema.safeParse(body({ externalId: "dep-1" }));
    if (!v.success) throw new Error(v.error.message);
    const ev = await persistValidatedEvent("DEPLOYMENT", v.data);
    expect(ev.type).toBe("DEPLOYMENT");
    expect(ev.externalId).toBe("dep-1");
  });

  it("upserts by externalId when an externalId path is given", async () => {
    await seed();
    const first = deploymentBodySchema.safeParse(body({ version: "1.0.0" }));
    const second = deploymentBodySchema.safeParse(body({ version: "2.0.0" }));
    if (!first.success || !second.success) throw new Error("invalid");
    await persistValidatedEvent("DEPLOYMENT", first.data, "ext-1");
    await persistValidatedEvent("DEPLOYMENT", second.data, "ext-1");
    const all = await prisma.event.findMany({ where: { externalId: "ext-1" } });
    expect(all).toHaveLength(1);
    expect(all[0].version).toBe("2.0.0");
  });

  it("throws ServiceNotFoundError for an unknown service", async () => {
    const v = deploymentBodySchema.safeParse(body({ service: "ghost" }));
    if (!v.success) throw new Error(v.error.message);
    await expect(persistValidatedEvent("DEPLOYMENT", v.data)).rejects.toBeInstanceOf(ServiceNotFoundError);
  });
});

describe("createEvent initial status transition", () => {
  it("records a null -> status transition when a deployment has a deployStatus", async () => {
    await seed();
    const v = deploymentBodySchema.safeParse(body({ externalId: "dep-1", requester: "alice", deployStatus: "DEPLOYED" }));
    if (!v.success) throw new Error(v.error.message);
    // build EventData the way ingest does
    const { prisma: db } = await import("@/lib/db");
    const svc = await db.service.findFirst({ where: { slug: "payment-api" } });
    const ev = await createEvent({
      serviceId: svc!.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(),
      externalId: "dep-1", tags: [], fields: v.data.fields as Record<string, unknown>,
    });
    const hist = await prisma.statusTransition.findMany({ where: { eventId: ev.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0].fromStatus).toBeNull();
    expect(hist[0].toStatus).toBe("DEPLOYED");
    expect(hist[0].actorName).toBe("alice");
  });

  it("records no transition for a non-deployment event", async () => {
    await seed();
    const db = (await import("@/lib/db")).prisma;
    const svc = await db.service.findFirst({ where: { slug: "payment-api" } });
    const ev = await createEvent({
      serviceId: svc!.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(),
      tags: [], fields: { incidentType: "outage", incidentStatus: "INVESTIGATING", startedAt: new Date(), resolvedAt: null, comment: null },
    });
    expect(await prisma.statusTransition.count({ where: { eventId: ev.id } })).toBe(0);
  });
});
