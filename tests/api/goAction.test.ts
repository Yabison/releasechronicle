import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { signActionToken } from "@/lib/actionToken";
import { POST } from "@/app/api/go/[token]/route";

async function deployment(status: string) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  const ev = await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1", requester: "ci", changeType: "NORMAL", deployStatus: status, lot: "1" } });
  return ev;
}
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("POST /api/go/[token]", () => {
  it("advances the deployment to the token's target status, actor 'lien'", async () => {
    const ev = await deployment("DEPLOYED"); // next = TESTING
    const token = await signActionToken({ eventId: ev.id, to: "TESTING" });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx(token));
    expect([200, 303, 307]).toContain(res.status);
    const after = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(after.deployStatus).toBe("TESTING");
    const t = await prisma.statusTransition.findFirst({ where: { eventId: ev.id, toStatus: "TESTING" } });
    expect(t?.actorName).toBe("lien");
  });
  it("a second click is a no-op (state machine)", async () => {
    const ev = await deployment("DEPLOYED");
    const token = await signActionToken({ eventId: ev.id, to: "TESTING" });
    await POST(new Request("http://x", { method: "POST" }), ctx(token));
    await POST(new Request("http://x", { method: "POST" }), ctx(token));
    const after = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(after.deployStatus).toBe("TESTING");
    expect(await prisma.statusTransition.count({ where: { eventId: ev.id, toStatus: "TESTING" } })).toBe(1);
  });
  it("refuses a replayed token even once the transition is legal again", async () => {
    const ev = await deployment("DEPLOYED");
    const token = await signActionToken({ eventId: ev.id, to: "TESTING" });
    await POST(new Request("http://x", { method: "POST" }), ctx(token));
    // Roll the status back: the state machine alone would happily accept the link
    // a second time, which is what makes the link replayable for its whole TTL.
    await prisma.event.update({ where: { id: ev.id }, data: { deployStatus: "DEPLOYED" } });
    await POST(new Request("http://x", { method: "POST" }), ctx(token));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).deployStatus).toBe("DEPLOYED");
  });
  it("records the consumption once", async () => {
    const ev = await deployment("DEPLOYED");
    const token = await signActionToken({ eventId: ev.id, to: "TESTING" });
    await POST(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "203.0.113.4" } }), ctx(token));
    await POST(new Request("http://x", { method: "POST" }), ctx(token));
    const uses = await prisma.actionTokenUse.findMany();
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ eventId: ev.id, usedIp: "203.0.113.4" });
  });
  it("audits the click and the replay attempt", async () => {
    const ev = await deployment("DEPLOYED");
    const token = await signActionToken({ eventId: ev.id, to: "TESTING" });
    await POST(new Request("http://x", { method: "POST" }), ctx(token));
    await POST(new Request("http://x", { method: "POST" }), ctx(token));
    const rows = await prisma.auditLog.findMany({ orderBy: { at: "asc" } });
    expect(rows.map((r) => [r.action, r.ok])).toEqual([
      ["deploy.one_click", true],
      ["deploy.one_click", false],
    ]);
  });
  it("garbage token → no change", async () => {
    const ev = await deployment("DEPLOYED");
    await POST(new Request("http://x", { method: "POST" }), ctx("not-a-token"));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).deployStatus).toBe("DEPLOYED");
  });
});
