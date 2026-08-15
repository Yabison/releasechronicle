import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { updateEventLotAction } from "@/app/actions/events";

async function seedDeploy() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" } });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("updateEventLotAction", () => {
  it("sets a new lot", async () => {
    const ev = await seedDeploy();
    expect(await updateEventLotAction({ eventId: ev.id, lot: "rel-9", path: "/" })).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.lot).toBe("rel-9");
  });
  it("clears the lot when blank", async () => {
    const ev = await seedDeploy();
    await updateEventLotAction({ eventId: ev.id, lot: "  ", path: "/" });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.lot).toBeNull();
  });
  it("rejects a non-deployment", async () => {
    const c = await createCompany({ name: "B" });
    const p = await createProduct({ companyId: c.id, name: "P" });
    const s = await createService({ productId: p.id, name: "S", type: "API" });
    const inc = await createEvent({ serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), tags: [],
      fields: { incidentType: "x", incidentStatus: "INVESTIGATING", startedAt: new Date(), resolvedAt: null, comment: null } });
    const res = await updateEventLotAction({ eventId: inc.id, lot: "rel", path: "/" });
    expect(res.ok).toBe(false);
  });
});
