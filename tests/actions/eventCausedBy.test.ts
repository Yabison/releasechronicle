import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { updateEventCausedByAction } from "@/app/actions/events";

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p1 = await createProduct({ companyId: c.id, name: "Checkout" });
  const p2 = await createProduct({ companyId: c.id, name: "Billing" });
  const s1 = await createService({ productId: p1.id, name: "A", type: "API" });
  const s2 = await createService({ productId: p1.id, name: "B", type: "API" });
  const s3 = await createService({ productId: p2.id, name: "C", type: "API" });
  return { s1, s2, s3 };
}

function deployData(serviceId: string, occurredAt: Date) {
  return {
    serviceId, environment: "PROD" as const, type: "DEPLOYMENT" as const, occurredAt, tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL" as const, deployStatus: "DEPLOYED" as const },
  };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("updateEventCausedByAction", () => {
  it("links to a same-product cause", async () => {
    const { s1, s2 } = await seed();
    const cause = await createEvent(deployData(s2.id, new Date("2026-08-01T10:00:00Z")));
    const target = await createEvent(deployData(s1.id, new Date("2026-08-01T11:00:00Z")));
    const res = await updateEventCausedByAction({ eventId: target.id, causeId: cause.id, path: "/" });
    expect(res).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: target.id } }))?.causedById).toBe(cause.id);
  });

  it("maps a different-product cause to err.causeDifferentProduct", async () => {
    const { s1, s3 } = await seed();
    const cause = await createEvent(deployData(s3.id, new Date("2026-08-01T10:00:00Z")));
    const target = await createEvent(deployData(s1.id, new Date("2026-08-01T11:00:00Z")));
    const res = await updateEventCausedByAction({ eventId: target.id, causeId: cause.id, path: "/" });
    expect(res).toEqual({ ok: false, error: "err.causeDifferentProduct" });
  });

  it("maps a self-link to err.causeSelfLink", async () => {
    const { s1 } = await seed();
    const target = await createEvent(deployData(s1.id, new Date("2026-08-01T11:00:00Z")));
    const res = await updateEventCausedByAction({ eventId: target.id, causeId: target.id, path: "/" });
    expect(res).toEqual({ ok: false, error: "err.causeSelfLink" });
  });

  it("maps a cycle to err.causeCycle", async () => {
    const { s1 } = await seed();
    const a = await createEvent(deployData(s1.id, new Date("2026-08-01T10:00:00Z")));
    const b = await createEvent(deployData(s1.id, new Date("2026-08-01T11:00:00Z")));
    await updateEventCausedByAction({ eventId: a.id, causeId: b.id, path: "/" });
    const res = await updateEventCausedByAction({ eventId: b.id, causeId: a.id, path: "/" });
    expect(res).toEqual({ ok: false, error: "err.causeCycle" });
  });

  it("maps a non-existent cause to err.causeNotFound", async () => {
    const { s1 } = await seed();
    const target = await createEvent(deployData(s1.id, new Date("2026-08-01T11:00:00Z")));
    const res = await updateEventCausedByAction({ eventId: target.id, causeId: "nonexistent-id", path: "/" });
    expect(res).toEqual({ ok: false, error: "err.causeNotFound" });
  });

  it("maps a non-existent target to err.eventNotFound", async () => {
    const res = await updateEventCausedByAction({ eventId: "nonexistent-id", causeId: null, path: "/" });
    expect(res).toEqual({ ok: false, error: "err.eventNotFound" });
  });

  it("clears the link with a null causeId", async () => {
    const { s1, s2 } = await seed();
    const cause = await createEvent(deployData(s2.id, new Date("2026-08-01T10:00:00Z")));
    const target = await createEvent(deployData(s1.id, new Date("2026-08-01T11:00:00Z")));
    await updateEventCausedByAction({ eventId: target.id, causeId: cause.id, path: "/" });
    const res = await updateEventCausedByAction({ eventId: target.id, causeId: null, path: "/" });
    expect(res).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: target.id } }))?.causedById).toBeNull();
  });
});
