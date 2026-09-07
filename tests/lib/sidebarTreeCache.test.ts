import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// next/cache is the seam under test: what matters is which tag the cached tree is
// registered under, and that a revalidateTag call outside a request context (tests,
// the sweeper, any non-request caller of a hierarchy write) cannot break the write.
const spy = vi.hoisted(() => ({
  tags: [] as string[],
  revalidated: [] as string[],
  revalidateThrows: false,
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown, _keys: string[], opts?: { tags?: string[] }) => {
    spy.tags.push(...(opts?.tags ?? []));
    return fn;
  },
  revalidateTag: (tag: string) => {
    spy.revalidated.push(tag);
    if (spy.revalidateThrows) throw new Error("Invariant: static generation store missing in revalidateTag");
  },
}));

import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { getSidebarTree, getSidebarTreeCached } from "@/lib/tree";
import { invalidateSidebarTree, SIDEBAR_TREE_TAG } from "@/lib/cache";
import type { SessionUser } from "@/lib/auth/session";

const AUTH: SessionUser = { sub: "u1", name: "Dev", roles: ["devops"] };

beforeEach(async () => {
  await resetDb();
  spy.tags = [];
  spy.revalidated = [];
  spy.revalidateThrows = false;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("getSidebarTreeCached", () => {
  it("returns the same tree as the uncached query", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Payments" });
    await createService({ productId: p.id, name: "Checkout", type: "API" });

    expect(await getSidebarTreeCached(AUTH)).toEqual(await getSidebarTree(AUTH));
  });

  it("keeps the anonymous tree on a different cache key than the authenticated one", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Payments" });
    await createService({ productId: p.id, name: "Checkout", type: "API" });

    // Everything is private, so an anonymous viewer must not be served the
    // authenticated tree that was cached first.
    expect(await getSidebarTreeCached(AUTH)).toHaveLength(1);
    expect(await getSidebarTreeCached(null)).toHaveLength(0);
  });

  it("registers the tree under the tag that invalidation revalidates", async () => {
    await getSidebarTreeCached(AUTH);
    await invalidateSidebarTree();

    expect(spy.tags).toContain(SIDEBAR_TREE_TAG);
    expect(spy.revalidated).toEqual([SIDEBAR_TREE_TAG]);
  });
});

describe("invalidateSidebarTree", () => {
  it("swallows a revalidateTag that throws outside a request context", async () => {
    spy.revalidateThrows = true;

    await expect(invalidateSidebarTree()).resolves.toBeUndefined();
  });
});
