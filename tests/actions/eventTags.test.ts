import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { updateEventTagsAction } from "@/app/actions/events";

async function seedDeploy() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: ["old"],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" } });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("updateEventTagsAction", () => {
  it("replaces the tags, trimmed and de-duplicated", async () => {
    const ev = await seedDeploy();
    expect(await updateEventTagsAction({ eventId: ev.id, tags: [" canary ", "canary", "prod", ""], path: "/" })).toEqual({ ok: true });
    const tags = (await prisma.event.findUnique({ where: { id: ev.id } }))?.tags;
    expect(tags).toEqual(["canary", "prod"]);
  });
  it("can clear all tags", async () => {
    const ev = await seedDeploy();
    await updateEventTagsAction({ eventId: ev.id, tags: [], path: "/" });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.tags).toEqual([]);
  });
  it("rejects a non-array", async () => {
    const ev = await seedDeploy();
    // @ts-expect-error deliberately wrong type
    expect((await updateEventTagsAction({ eventId: ev.id, tags: "nope", path: "/" })).ok).toBe(false);
  });
});
