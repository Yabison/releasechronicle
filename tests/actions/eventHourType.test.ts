import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { updateEventHourTypeAction } from "@/app/actions/events";

async function seedDeploy(hourType: string | null = null) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0", hourType } });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("updateEventHourTypeAction", () => {
  it("sets HNO on a deployment", async () => {
    const ev = await seedDeploy();
    expect(await updateEventHourTypeAction({ eventId: ev.id, hourType: "HNO", path: "/" })).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.hourType).toBe("HNO");
  });
  it("clears the hour type with an empty string", async () => {
    const ev = await seedDeploy("HO");
    expect(await updateEventHourTypeAction({ eventId: ev.id, hourType: "", path: "/" })).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.hourType).toBeNull();
  });
  it("rejects an invalid value", async () => {
    const ev = await seedDeploy();
    const res = await updateEventHourTypeAction({ eventId: ev.id, hourType: "NOPE", path: "/" });
    expect(res.ok).toBe(false);
  });
  it("rejects a non-deployment", async () => {
    const c = await createCompany({ name: "B" });
    const p = await createProduct({ companyId: c.id, name: "P" });
    const s = await createService({ productId: p.id, name: "S", type: "API" });
    const inc = await createEvent({ serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), tags: [],
      fields: { incidentType: "x", incidentStatus: "INVESTIGATING", startedAt: new Date(), resolvedAt: null, comment: null } });
    const res = await updateEventHourTypeAction({ eventId: inc.id, hourType: "HNO", path: "/" });
    expect(res.ok).toBe(false);
  });
});
