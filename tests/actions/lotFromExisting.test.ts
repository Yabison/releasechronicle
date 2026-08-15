import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { listLotCandidates } from "@/lib/deployLot";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { createLotFromExistingAction } from "@/app/actions/events";

async function setup() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s1 = await createService({ productId: p.id, name: "API", type: "API" });
  const s2 = await createService({ productId: p.id, name: "Worker", type: "APP" });
  const dep = (serviceId: string, over: Record<string, unknown> = {}) =>
    createEvent({ serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: null, ...over } });
  return { s1, s2, dep };
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("lot from existing deployments", () => {
  it("lists company+env candidates (lot empty or solo)", async () => {
    const { s1, s2, dep } = await setup();
    await dep(s1.id);
    await dep(s2.id);
    const cands = await listLotCandidates("acme", "PROD");
    expect(cands).toHaveLength(2);
    expect(cands.map((c) => c.service).sort()).toEqual(["api", "worker"]);
  });

  it("assigns an existing lot to the selected deployments", async () => {
    const { s1, s2, dep } = await setup();
    const a = await dep(s1.id);
    const b = await dep(s2.id);
    const res = await createLotFromExistingAction({ eventIds: [a.id, b.id], lot: "release-2026.08", path: "/" });
    expect(res).toEqual({ ok: true, count: 2 });
    const rows = await prisma.event.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((e) => e.lot === "release-2026.08" && e.autoLot === false)).toBe(true);
  });

  it("rejects an empty lot key or empty selection", async () => {
    const { s1, dep } = await setup();
    const a = await dep(s1.id);
    expect((await createLotFromExistingAction({ eventIds: [a.id], lot: "  ", path: "/" })).ok).toBe(false);
    expect((await createLotFromExistingAction({ eventIds: [], lot: "rel", path: "/" })).ok).toBe(false);
  });
});
