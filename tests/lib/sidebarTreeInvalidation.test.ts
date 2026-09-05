import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// The structure of the tree must be exact the moment a write returns, so every
// hierarchy write is expected to invalidate the cached tree. Event counts are not:
// they ride the cache TTL. next/cache is the only mock — the chain under test is
// the real one (write → invalidateSidebarTree → revalidateTag).
const spy = vi.hoisted(() => ({ revalidated: [] as string[] }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (tag: string) => {
    spy.revalidated.push(tag);
  },
}));

import { resetDb, prisma } from "../setup/db";
import {
  createCompany, createProduct, createService,
  updateCompanyOrder, updateProduct, updateService,
  moveProduct, moveService,
} from "@/lib/hierarchy";
import {
  deleteCompany, deleteProduct, deleteService,
  restoreCompany, restoreProduct, restoreService,
} from "@/lib/hierarchyDelete";
import { setPublicEventTypes } from "@/lib/visibility";
import { SIDEBAR_TREE_TAG } from "@/lib/cache";

/** How many times the sidebar tree was dropped since the last reset. */
function drops(): number {
  return spy.revalidated.filter((t) => t === SIDEBAR_TREE_TAG).length;
}

beforeEach(async () => {
  await resetDb();
  spy.revalidated = [];
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedOne() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Payments" });
  const s = await createService({ productId: p.id, name: "Checkout", type: "API" });
  return { c, p, s };
}

describe("sidebar tree invalidation", () => {
  it("fires on every hierarchy create", async () => {
    const c = await createCompany({ name: "Acme" });
    expect(drops()).toBe(1);
    const p = await createProduct({ companyId: c.id, name: "Payments" });
    expect(drops()).toBe(2);
    await createService({ productId: p.id, name: "Checkout", type: "API" });
    expect(drops()).toBe(3);
  });

  it("fires on every hierarchy delete", async () => {
    const { c, p, s } = await seedOne();
    spy.revalidated = [];
    await deleteService(s.id);
    expect(drops()).toBe(1);
    await deleteProduct(p.id);
    expect(drops()).toBe(2);
    await deleteCompany(c.id);
    expect(drops()).toBe(3);
  });

  it("fires on every hierarchy restore", async () => {
    const { c, p, s } = await seedOne();
    // Each level is restored from its own delete: a parent's restore lifts its
    // whole batch, so restoring the company would leave nothing else deleted.
    await deleteService(s.id);
    spy.revalidated = [];
    await restoreService(s.id);
    expect(drops()).toBe(1);

    await deleteProduct(p.id);
    spy.revalidated = [];
    await restoreProduct(p.id);
    expect(drops()).toBe(1);

    await deleteCompany(c.id);
    spy.revalidated = [];
    await restoreCompany(c.id);
    expect(drops()).toBe(1);
  });

  it("fires when a service or a product is moved", async () => {
    const { c, p, s } = await seedOne();
    const p2 = await createProduct({ companyId: c.id, name: "Billing" });
    const c2 = await createCompany({ name: "Globex" });
    spy.revalidated = [];
    await moveService(s.id, p2.id);
    expect(drops()).toBe(1);
    await moveProduct(p.id, c2.id);
    expect(drops()).toBe(2);
  });

  it("fires when an order or a public flag changes", async () => {
    const { c, p, s } = await seedOne();
    spy.revalidated = [];
    await updateCompanyOrder(c.id, 5);
    expect(drops()).toBe(1);
    await updateProduct(p.id, { public: true });
    expect(drops()).toBe(2);
    await updateService(s.id, { public: true });
    expect(drops()).toBe(3);
  });

  it("fires when the public event types change, which the anonymous tree counts", async () => {
    await setPublicEventTypes(["DEPLOYMENT"]);

    expect(drops()).toBe(1);
  });
});
