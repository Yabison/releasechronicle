import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import {
  deleteCompany, deleteProduct, deleteService,
  restoreCompany, restoreProduct, restoreService, RestoreBlockedError,
  HierarchyStateConflictError,
} from "@/lib/hierarchyDelete";

async function tree() {
  const c = await createCompany({ name: "Acme" });
  const p1 = await createProduct({ companyId: c.id, name: "Checkout" });
  const p2 = await createProduct({ companyId: c.id, name: "Billing" });
  const s1 = await createService({ productId: p1.id, name: "API", type: "API" });
  const s2 = await createService({ productId: p1.id, name: "Web", type: "APP" });
  const s3 = await createService({ productId: p2.id, name: "Core", type: "API" });
  return { c, p1, p2, s1, s2, s3 };
}
const row = (m: "company" | "product" | "service", id: string) =>
  (prisma[m] as { findUniqueOrThrow: (a: unknown) => Promise<{ deletedAt: Date | null; deletedBatch: string | null }> })
    .findUniqueOrThrow({ where: { id } });

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("cascading delete", () => {
  it("stamps a company, its products and its services with one shared batch", async () => {
    const t = await tree();
    const counts = await deleteCompany(t.c.id);
    expect(counts).toEqual({ products: 2, services: 3 });
    const c = await row("company", t.c.id);
    expect(c.deletedAt).toBeInstanceOf(Date);
    expect(c.deletedBatch).toEqual(expect.any(String));
    for (const id of [t.p1.id, t.p2.id]) {
      const p = await row("product", id);
      expect(p.deletedBatch).toBe(c.deletedBatch);
      expect(p.deletedAt).toEqual(c.deletedAt);
    }
    for (const id of [t.s1.id, t.s2.id, t.s3.id]) {
      expect((await row("service", id)).deletedBatch).toBe(c.deletedBatch);
    }
  });

  it("deleting a product leaves its siblings and their services alone", async () => {
    const t = await tree();
    expect(await deleteProduct(t.p1.id)).toEqual({ services: 2 });
    expect((await row("product", t.p2.id)).deletedAt).toBeNull();
    expect((await row("service", t.s3.id)).deletedAt).toBeNull();
    expect((await row("service", t.s1.id)).deletedAt).toBeInstanceOf(Date);
  });

  it("never touches events", async () => {
    const t = await tree();
    const { createEvent } = await import("@/lib/events");
    const ev = await createEvent({
      serviceId: t.s1.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "1.0.0" },
    } as never);
    await deleteCompany(t.c.id);
    const still = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(still.deletedAt).toBeNull();
  });

  it("refuses to delete something already deleted", async () => {
    const t = await tree();
    await deleteService(t.s1.id);
    await expect(deleteService(t.s1.id)).rejects.toThrow();
  });

  it("under concurrent deletes of the same service, exactly one wins", async () => {
    const t = await tree();
    const results = await Promise.allSettled([deleteService(t.s1.id), deleteService(t.s1.id)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    // Exactly one call's defensive updateMany (or its earlier findUnique guard) can
    // observe a live row and win; the other must be refused, never silently
    // clobber the winner's stamp (see the concurrency note atop hierarchyDelete.ts).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(HierarchyStateConflictError);
    // Both calls are literally identical (same id, no distinguishing input), so
    // there is no independent way to name "which JS call" won beyond the fact that
    // the row now carries exactly one winner's stamp, not a mix and not null.
    const row1 = await row("service", t.s1.id);
    expect(row1.deletedAt).toBeInstanceOf(Date);
    expect(row1.deletedBatch).toEqual(expect.any(String));
  });
});

describe("restore", () => {
  it("restores exactly the batch it deleted", async () => {
    const t = await tree();
    await deleteCompany(t.c.id);
    const counts = await restoreCompany(t.c.id);
    expect(counts).toEqual({ products: 2, services: 3 });
    for (const [m, id] of [["company", t.c.id], ["product", t.p1.id], ["service", t.s3.id]] as const) {
      const r = await row(m, id);
      expect(r.deletedAt).toBeNull();
      expect(r.deletedBatch).toBeNull();
    }
  });

  it("does NOT resurrect a child deleted before the parent", async () => {
    const t = await tree();
    await deleteService(t.s2.id);          // its own batch
    await deleteCompany(t.c.id);           // cascade skips s2, it is not live
    await restoreCompany(t.c.id);
    expect((await row("service", t.s2.id)).deletedAt).toBeInstanceOf(Date);
    expect((await row("service", t.s1.id)).deletedAt).toBeNull();
  });

  it("refuses when an ancestor is still deleted, naming it", async () => {
    const t = await tree();
    await deleteCompany(t.c.id);
    await expect(restoreProduct(t.p1.id)).rejects.toThrow(RestoreBlockedError);
    await expect(restoreProduct(t.p1.id)).rejects.toThrow(/acme/i);
  });

  it("restoring a service directly after a company-wide delete names the company, not the product", async () => {
    const t = await tree();
    await deleteCompany(t.c.id); // cascades to p1 ("checkout") and s1, one shared batch
    await expect(restoreService(t.s1.id)).rejects.toThrow(RestoreBlockedError);
    await expect(restoreService(t.s1.id)).rejects.toThrow(/acme/i);
    await expect(restoreService(t.s1.id)).rejects.not.toThrow(/checkout/i);
  });

  it("refuses when a live row has taken the slug", async () => {
    const c = await createCompany({ name: "Acme" });
    await deleteCompany(c.id);
    await createCompany({ name: "Acme" });   // now holds "acme"
    await expect(restoreCompany(c.id)).rejects.toThrow(RestoreBlockedError);
  });

  it("restores a service on its own without touching its siblings", async () => {
    const t = await tree();
    await deleteService(t.s1.id);
    await deleteService(t.s2.id); // sibling under the same product, its own batch
    const siblingBefore = await row("service", t.s2.id);
    await restoreService(t.s1.id);
    expect((await row("service", t.s1.id)).deletedAt).toBeNull();
    const siblingAfter = await row("service", t.s2.id);
    expect(siblingAfter.deletedAt).toEqual(siblingBefore.deletedAt);
    expect(siblingAfter.deletedBatch).toEqual(siblingBefore.deletedBatch);
  });
});
