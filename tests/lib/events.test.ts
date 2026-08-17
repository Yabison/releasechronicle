import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import {
  createEvent,
  upsertEventByExternalId,
  listServiceEvents,
  currentVersions,
  addRollback,
  addQaValidation,
  addObservation,
  AnnotationTargetError,
} from "@/lib/events";

async function seedService() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return createService({ productId: p.id, name: "Payment API", type: "API" });
}

function deployData(serviceId: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    serviceId,
    environment: "PROD" as const,
    type: "DEPLOYMENT" as const,
    occurredAt: new Date("2026-06-25T10:00:00Z"),
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL" as const, externalLink: null, deployStatus: "DEPLOYED" as const },
    ...over,
  };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("createEvent", () => {
  it("creates a deployment with its type fields and canonical occurredAt", async () => {
    const s = await seedService();
    const ev = await createEvent(deployData(s.id));
    expect(ev.type).toBe("DEPLOYMENT");
    expect(ev.version).toBe("1.0.0");
    expect(ev.occurredAt.toISOString()).toBe("2026-06-25T10:00:00.000Z");
    expect(ev.source).toBe("API");
  });

  it("records the requester as the actor of the initial transition", async () => {
    const s = await seedService();
    const ev = await createEvent(deployData(s.id));
    const tx = await prisma.statusTransition.findFirst({ where: { eventId: ev.id } });
    expect(tx?.actorName).toBe("ci");
  });

  it("leaves the initial actor null when no requester was given", async () => {
    const s = await seedService();
    const ev = await createEvent(deployData(s.id, {
      fields: { version: "1.0.0", requester: "", changeType: "NORMAL" as const, externalLink: null, deployStatus: "DEPLOYED" as const },
    }));
    const tx = await prisma.statusTransition.findFirst({ where: { eventId: ev.id } });
    expect(tx?.actorName).toBeNull();
  });
});

describe("upsertEventByExternalId", () => {
  it("creates then updates in place on repeat", async () => {
    const s = await seedService();
    const first = await upsertEventByExternalId("deploy-42", deployData(s.id));
    const second = await upsertEventByExternalId("deploy-42", deployData(s.id, { fields: { version: "2.0.0", requester: "ci", changeType: "NORMAL" as const, externalLink: null, deployStatus: "DEPLOYED" as const } }));
    expect(second.id).toBe(first.id);
    expect(second.version).toBe("2.0.0");
    const count = await prisma.event.count();
    expect(count).toBe(1);
  });
});

describe("listServiceEvents", () => {
  it("returns events newest-first, excludes soft-deleted, embeds derived + annotations", async () => {
    const s = await seedService();
    const dep = await createEvent(deployData(s.id, { occurredAt: new Date("2026-06-25T09:00:00Z") }));
    await addRollback(dep.id, { comment: "reverted", link: null });
    const inc = await createEvent({
      serviceId: s.id, environment: "PROD", type: "INCIDENT",
      occurredAt: new Date("2026-06-25T10:00:00Z"),
      fields: { incidentType: "outage", startedAt: new Date("2026-06-25T10:00:00Z"), resolvedAt: null, comment: null },
    });
    const deleted = await createEvent(deployData(s.id, { occurredAt: new Date("2026-06-25T11:00:00Z") }));
    await prisma.event.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const list = await listServiceEvents(s.id, {});
    expect(list.map((e) => e.id)).toEqual([inc.id, dep.id]); // newest first, deleted excluded
    const incidentRow = list.find((e) => e.id === inc.id)!;
    expect(incidentRow.derived).toEqual(expect.objectContaining({ open: true }));
    const depRow = list.find((e) => e.id === dep.id)!;
    expect(depRow.rollbacks).toHaveLength(1);
  });

  it("filters by environment and type", async () => {
    const s = await seedService();
    await createEvent(deployData(s.id, { environment: "QA" }));
    await createEvent(deployData(s.id, { environment: "PROD" }));
    const prod = await listServiceEvents(s.id, { environment: "PROD", type: "DEPLOYMENT" });
    expect(prod).toHaveLength(1);
    expect(prod[0].environment).toBe("PROD");
  });

  it("windows by occurredAt: only events inside [from, to] load", async () => {
    const s = await seedService();
    await createEvent(deployData(s.id, { occurredAt: new Date("2026-01-10T10:00:00Z"), fields: { version: "old", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" } }));
    await createEvent(deployData(s.id, { occurredAt: new Date("2026-05-10T10:00:00Z"), fields: { version: "mid", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" } }));
    await createEvent(deployData(s.id, { occurredAt: new Date("2026-08-10T10:00:00Z"), fields: { version: "new", requester: "ci", changeType: "NORMAL", externalLink: null, deployStatus: "DEPLOYED" } }));
    const windowed = await listServiceEvents(s.id, { from: new Date("2026-04-01"), to: new Date("2026-06-01") });
    expect(windowed.map((e) => e.version)).toEqual(["mid"]);
    const open = await listServiceEvents(s.id, { from: new Date("2026-04-01") });
    expect(open.map((e) => e.version)).toEqual(["new", "mid"]);
  });

  it("counts events older than a date without loading them", async () => {
    const s = await seedService();
    await createEvent(deployData(s.id, { occurredAt: new Date("2026-01-10T10:00:00Z") }));
    await createEvent(deployData(s.id, { occurredAt: new Date("2026-08-10T10:00:00Z") }));
    const { countServiceEventsBefore } = await import("@/lib/events");
    expect(await countServiceEventsBefore(s.id, new Date("2026-04-01"))).toBe(1);
  });

  it("embeds maintenance status in the feed", async () => {
    const s = await seedService();
    const m = await createEvent({
      serviceId: s.id, environment: "PROD", type: "MAINTENANCE",
      occurredAt: new Date("2026-06-25T08:00:00Z"),
      fields: { version: null, windowStart: new Date("2026-06-25T08:00:00Z"), windowEnd: new Date("2026-06-25T09:00:00Z") },
    });
    const list = await listServiceEvents(s.id, {}, new Date("2026-06-25T10:00:00Z"));
    const row = list.find((e) => e.id === m.id)!;
    expect(row.derived).toEqual({ status: "Complete" });
  });
});

describe("currentVersions", () => {
  it("returns the latest deployment version per environment", async () => {
    const s = await seedService();
    await createEvent(deployData(s.id, { environment: "PROD", occurredAt: new Date("2026-06-25T08:00:00Z") }));
    await createEvent(deployData(s.id, { environment: "PROD", occurredAt: new Date("2026-06-25T09:00:00Z"), fields: { version: "1.1.0", requester: "ci", changeType: "NORMAL" as const, externalLink: null, deployStatus: "DEPLOYED" as const } }));
    const current = await currentVersions(s.id);
    expect(current.PROD.version).toBe("1.1.0");
  });
});

describe("addRollback guard", () => {
  it("throws AnnotationTargetError when the event is not a deployment", async () => {
    const s = await seedService();
    const inc = await createEvent({
      serviceId: s.id, environment: "PROD", type: "INCIDENT",
      occurredAt: new Date(), fields: { incidentType: "x", startedAt: new Date(), resolvedAt: null, comment: null },
    });
    await expect(addRollback(inc.id, { comment: "no", link: null })).rejects.toBeInstanceOf(AnnotationTargetError);
  });
});

describe("addQaValidation", () => {
  it("addQaValidation attaches to a deployment", async () => {
    const s = await seedService();
    const dep = await createEvent(deployData(s.id));
    const qa = await addQaValidation(dep.id, { validatedBy: "qa-bot", comment: null });
    expect(qa).not.toBeNull();
    expect(await prisma.qaValidation.count()).toBe(1);
  });
});

describe("addObservation", () => {
  it("addObservation attaches to a deployment", async () => {
    const s = await seedService();
    const dep = await createEvent(deployData(s.id));
    const obs = await addObservation(dep.id, { who: "sre", durationMinutes: 15, comment: null });
    expect(obs).not.toBeNull();
    expect(await prisma.observation.count()).toBe(1);
  });
});
