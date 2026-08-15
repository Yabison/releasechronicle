import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { siblings, getLotMembers, lotKey, type LotMember } from "@/lib/deployLot";

const M = (over: Partial<LotMember>): LotMember => ({
  eventId: "x", company: "c", product: "p", service: "s", version: "1", environment: "PROD", deployStatus: "DEPLOYED", isMaster: false, rolledBack: false, ...over,
});

describe("siblings", () => {
  it("returns other members of the lot, excluding self", () => {
    const all = [M({ eventId: "a" }), M({ eventId: "b" }), M({ eventId: "c" })];
    expect(siblings(all, "b").map((m) => m.eventId)).toEqual(["a", "c"]);
  });
  it("is empty for a singleton", () => {
    expect(siblings([M({ eventId: "a" })], "a")).toEqual([]);
  });
});

async function dep(serviceId: string, over: Record<string, unknown>) {
  return createEvent({ serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "rel-1", ...over } });
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("getLotMembers", () => {
  it("buckets deployment members across products by (env, lot)", async () => {
    const c = await createCompany({ name: "Acme" });
    const p1 = await createProduct({ companyId: c.id, name: "Checkout" });
    const p2 = await createProduct({ companyId: c.id, name: "Billing" });
    const s1 = await createService({ productId: p1.id, name: "API", type: "API" });
    const s2 = await createService({ productId: p2.id, name: "Worker", type: "APP" });
    await dep(s1.id, {});
    await dep(s2.id, {});
    const map = await getLotMembers(["rel-1"]);
    const key = lotKey("PROD", "rel-1");
    expect(map[key]).toHaveLength(2);
    const products = map[key].map((m) => m.product).sort();
    expect(products).toEqual(["billing", "checkout"]);
    expect(map[key][0].deployStatus).toBe("DEPLOYED");
  });
  it("keeps the same lot name in different environments apart", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({ productId: p.id, name: "API", type: "API" });
    await dep(s.id, { environment: "PROD" });
    await dep(s.id, { environment: "PREPROD" });
    const map = await getLotMembers(["rel-1"]);
    expect(map[lotKey("PROD", "rel-1")]).toHaveLength(1);
    expect(map[lotKey("PREPROD", "rel-1")]).toHaveLength(1);
  });
  it("returns an empty map for no lots", async () => {
    expect(await getLotMembers([])).toEqual({});
  });
});
