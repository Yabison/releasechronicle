import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => ({ sub: "u", name: "Tester", roles: ["admin", "devops", "qa"] }) }));
import { createLotAction } from "@/app/actions/events";

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s1 = await createService({ productId: p.id, name: "API", type: "API" });
  const s2 = await createService({ productId: p.id, name: "Worker", type: "COMPONENT" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  return { s1, s2 };
}
const common = { environment: "PROD", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "LOT-X" };
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("createLotAction", () => {
  it("creates one deployment per item, all sharing the lot", async () => {
    await seed();
    const r = await createLotAction({ path: "/", common, items: [
      { company: "acme", product: "checkout", service: "api", version: "1.0.0" },
      { company: "acme", product: "checkout", service: "worker", version: "2.0.0", externalLink: "https://ci/2" },
    ] });
    expect(r).toEqual({ ok: true, created: 2 });
    const rows = await prisma.event.findMany({ where: { lot: "LOT-X", type: "DEPLOYMENT" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((e) => e.lot === "LOT-X")).toBe(true);
  });
  it("rejects empty items", async () => {
    await seed();
    expect((await createLotAction({ path: "/", common, items: [] })).ok).toBe(false);
  });
  it("creates nothing if a row is invalid (unknown service)", async () => {
    await seed();
    const r = await createLotAction({ path: "/", common, items: [
      { company: "acme", product: "checkout", service: "api", version: "1.0.0" },
      { company: "acme", product: "checkout", service: "ghost", version: "2.0.0" },
    ] });
    expect(r.ok).toBe(false);
    expect(await prisma.event.count()).toBe(0);
  });
  it("rejects a missing version (validation)", async () => {
    await seed();
    const r = await createLotAction({ path: "/", common, items: [{ company: "acme", product: "checkout", service: "api", version: "" }] });
    expect(r.ok).toBe(false);
    expect(await prisma.event.count()).toBe(0);
  });
});
