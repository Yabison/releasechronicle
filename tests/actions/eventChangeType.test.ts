import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { updateEventChangeTypeAction } from "@/app/actions/events";

async function seedDeploy() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" } });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("updateEventChangeTypeAction", () => {
  it("reclassifies a MEP as HOTFIX", async () => {
    const ev = await seedDeploy();
    expect(await updateEventChangeTypeAction({ eventId: ev.id, changeType: "HOTFIX", path: "/" })).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.changeType).toBe("HOTFIX");
  });
  it("rejects an invalid type", async () => {
    const ev = await seedDeploy();
    const res = await updateEventChangeTypeAction({ eventId: ev.id, changeType: "NOPE", path: "/" });
    expect(res.ok).toBe(false);
  });
  it("rejects a non-deployment", async () => {
    const c = await createCompany({ name: "B" });
    const p = await createProduct({ companyId: c.id, name: "P" });
    const s = await createService({ productId: p.id, name: "S", type: "API" });
    const inc = await createEvent({ serviceId: s.id, environment: "PROD", type: "INCIDENT", occurredAt: new Date(), tags: [],
      fields: { incidentType: "x", incidentStatus: "INVESTIGATING", startedAt: new Date(), resolvedAt: null, comment: null } });
    const res = await updateEventChangeTypeAction({ eventId: inc.id, changeType: "HOTFIX", path: "/" });
    expect(res.ok).toBe(false);
  });
});
