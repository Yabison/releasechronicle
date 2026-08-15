import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Alice", roles: ["devops"] }) }));
import { updateEventCommentAction, addEventCommentAction } from "@/app/actions/events";

async function seedDeploy() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" } });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("updateEventCommentAction", () => {
  it("adds a comment", async () => {
    const ev = await seedDeploy();
    expect(await updateEventCommentAction({ eventId: ev.id, comment: "à surveiller", path: "/" })).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.comment).toBe("à surveiller");
  });
  it("clears the comment when blank", async () => {
    const ev = await seedDeploy();
    await updateEventCommentAction({ eventId: ev.id, comment: "x", path: "/" });
    await updateEventCommentAction({ eventId: ev.id, comment: "   ", path: "/" });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.comment).toBeNull();
  });
});

describe("addEventCommentAction (thread)", () => {
  it("appends a comment with the session author", async () => {
    const ev = await seedDeploy();
    expect(await addEventCommentAction({ eventId: ev.id, body: "à surveiller", path: "/" })).toEqual({ ok: true });
    const rows = await prisma.eventComment.findMany({ where: { eventId: ev.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].author).toBe("Alice");
    expect(rows[0].body).toBe("à surveiller");
  });
  it("rejects an empty body", async () => {
    const ev = await seedDeploy();
    expect((await addEventCommentAction({ eventId: ev.id, body: "  ", path: "/" })).ok).toBe(false);
    expect(await prisma.eventComment.count()).toBe(0);
  });
});
