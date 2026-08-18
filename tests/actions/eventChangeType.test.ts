import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { updateEventChangeTypeAction } from "@/app/actions/events";

async function seedDeploy(opts: { changeType?: string; parentId?: string | null } = {}) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: {
      version: "1.0.0", requester: "ci", changeType: opts.changeType ?? "NORMAL",
      deployStatus: "DEPLOYED", lot: "1.0.0", parentId: opts.parentId ?? null,
    } });
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

  it("allows PRE_MEP -> POST_MEP on an event that has a parent", async () => {
    const parent = await seedDeploy();
    const ev = await seedDeploy({ changeType: "PRE_MEP", parentId: parent.id });
    expect(await updateEventChangeTypeAction({ eventId: ev.id, changeType: "POST_MEP", path: "/" })).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.changeType).toBe("POST_MEP");
  });

  it("allows leaving a phase (PRE_MEP -> NORMAL) with no parent required", async () => {
    const parent = await seedDeploy();
    const ev = await seedDeploy({ changeType: "PRE_MEP", parentId: parent.id });
    expect(await updateEventChangeTypeAction({ eventId: ev.id, changeType: "NORMAL", path: "/" })).toEqual({ ok: true });
  });

  it("rejects entering PRE_MEP on an event with no parent", async () => {
    const ev = await seedDeploy(); // NORMAL, no parentId
    const res = await updateEventChangeTypeAction({ eventId: ev.id, changeType: "PRE_MEP", path: "/" });
    expect(res).toEqual({ ok: false, error: "err.phaseNeedsParent" });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.changeType).toBe("NORMAL");
  });

  it("allows NORMAL -> POST_MEP on an event that already has a parent", async () => {
    const parent = await seedDeploy();
    const ev = await seedDeploy({ changeType: "NORMAL", parentId: parent.id });
    expect(await updateEventChangeTypeAction({ eventId: ev.id, changeType: "POST_MEP", path: "/" })).toEqual({ ok: true });
  });
});
