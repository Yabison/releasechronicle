import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { getMessages } from "@/i18n";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { updateEventDateAction } from "@/app/actions/events";

async function svc() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return createService({ productId: p.id, name: "API", type: "API" });
}
function dep(serviceId: string, occurredAt: Date, over: Record<string, unknown> = {}) {
  return createEvent({ serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt, tags: [],
    fields: { version: "1", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: null, ...over } });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("updateEventDateAction", () => {
  it("changes occurredAt", async () => {
    const s = await svc();
    const ev = await dep(s.id, new Date("2026-06-01T10:00:00Z"));
    const res = await updateEventDateAction({ eventId: ev.id, occurredAt: "2026-06-02T12:00:00Z", path: "/" });
    expect(res).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: ev.id } }))?.occurredAt.toISOString()).toBe("2026-06-02T12:00:00.000Z");
  });
  it("rejects an invalid date", async () => {
    const s = await svc();
    const ev = await dep(s.id, new Date());
    expect((await updateEventDateAction({ eventId: ev.id, occurredAt: "not-a-date", path: "/" })).ok).toBe(false);
  });
  it("keeps a PRE MEP before its parent", async () => {
    const s = await svc();
    const parent = await dep(s.id, new Date("2026-06-10T10:00:00Z"));
    const pre = await dep(s.id, new Date("2026-06-09T10:00:00Z"), { changeType: "PRE_MEP", parentId: parent.id });
    const bad = await updateEventDateAction({ eventId: pre.id, occurredAt: "2026-06-11T10:00:00Z", path: "/" });
    expect(bad.ok).toBe(false);
    const ok = await updateEventDateAction({ eventId: pre.id, occurredAt: "2026-06-09T08:00:00Z", path: "/" });
    expect(ok.ok).toBe(true);
  });
  it("reports errors as i18n keys defined in every catalog", async () => {
    const s = await svc();
    const ev = await dep(s.id, new Date());
    const res = await updateEventDateAction({ eventId: ev.id, occurredAt: "not-a-date", path: "/" });
    expect(res.ok).toBe(false);
    const key = (res as { error: string }).error;
    expect(key).toMatch(/^err\./);
    expect(getMessages("fr")[key]).toBeTruthy();
    expect(getMessages("en")[key]).toBeTruthy();
  });
});
