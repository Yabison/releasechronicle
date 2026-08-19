import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Deleting stamps the target AND its live descendants with one shared
 * (deletedAt, deletedBatch). That buys the invariant the whole feature rests on:
 * a service with deletedAt = null necessarily has a live product and company —
 * so every existing `deletedAt: null` filter is correct without walking parents.
 *
 * Restoring lifts exactly the rows sharing the batch, which is why the batch
 * exists at all: a child deleted BEFORE its parent carries a different batch and
 * must not be resurrected by the parent's restore.
 *
 * Events are never touched: they are the historical record.
 *
 * Concurrency: every write that changes a row's delete-state is an `updateMany`
 * re-asserting the precondition (`deletedAt: null` for a delete, `deletedAt: { not:
 * null }` for a restore/cascade), not a `findUnique` + `update` pair. Under READ
 * COMMITTED, a plain `update({ where: { id } })` does not recheck the row's state,
 * so two concurrent calls can both pass an earlier `findUnique` guard and the
 * second silently clobbers the first. An `updateMany` with the guard in its WHERE
 * clause is different: Postgres re-evaluates that WHERE against the latest
 * committed row when the statement acquires its lock, so a loser's statement
 * matches zero rows once the winner has committed. Checking `result.count === 0`
 * afterward turns that into an explicit, typed refusal instead of a silent no-op.
 */

export class HierarchyNotFoundError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "HierarchyNotFoundError";
  }
}

/** The target is not in the state the operation requires: already deleted (delete
 *  path) or not deleted / no longer deleted (restore path). A 409-shaped conflict,
 *  distinct from "doesn't exist" (HierarchyNotFoundError). */
export class HierarchyStateConflictError extends Error {
  constructor(message = "not in the expected state") {
    super(message);
    this.name = "HierarchyStateConflictError";
  }
}

export type RestoreBlock = "ancestorDeleted" | "slugTaken";

export class RestoreBlockedError extends Error {
  constructor(readonly reason: RestoreBlock, message: string) {
    super(message);
    this.name = "RestoreBlockedError";
  }
}

export type RestoreCounts = { products?: number; services?: number };

export async function deleteCompany(id: string): Promise<{ products: number; services: number }> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!company) throw new HierarchyNotFoundError("company not found");
    if (company.deletedAt) throw new HierarchyStateConflictError("company is already deleted");
    const stamp = { deletedAt: new Date(), deletedBatch: randomUUID() };
    const liveProducts = await tx.product.findMany({
      where: { companyId: id, deletedAt: null }, select: { id: true },
    });
    const productIds = liveProducts.map((p) => p.id);
    const services = productIds.length
      ? await tx.service.updateMany({ where: { productId: { in: productIds }, deletedAt: null }, data: stamp })
      : { count: 0 };
    // Re-guard with deletedAt: null: productIds came from an earlier read in this
    // same transaction, so a concurrent deleteProduct() could have claimed one of
    // them (with its own batch) in the meantime. Without this filter we'd overwrite
    // that product's batch here while its services (guarded above) keep the other
    // one — breaking the shared-batch invariant restore depends on.
    const products = productIds.length
      ? await tx.product.updateMany({ where: { id: { in: productIds }, deletedAt: null }, data: stamp })
      : { count: 0 };
    const updated = await tx.company.updateMany({ where: { id, deletedAt: null }, data: stamp });
    if (updated.count === 0) throw new HierarchyStateConflictError("company is already deleted");
    return { products: products.count, services: services.count };
  });
}

export async function deleteProduct(id: string): Promise<{ services: number }> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!product) throw new HierarchyNotFoundError("product not found");
    if (product.deletedAt) throw new HierarchyStateConflictError("product is already deleted");
    const stamp = { deletedAt: new Date(), deletedBatch: randomUUID() };
    const services = await tx.service.updateMany({ where: { productId: id, deletedAt: null }, data: stamp });
    const updated = await tx.product.updateMany({ where: { id, deletedAt: null }, data: stamp });
    if (updated.count === 0) throw new HierarchyStateConflictError("product is already deleted");
    return { services: services.count };
  });
}

export async function deleteService(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!service) throw new HierarchyNotFoundError("service not found");
    if (service.deletedAt) throw new HierarchyStateConflictError("service is already deleted");
    const updated = await tx.service.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBatch: randomUUID() },
    });
    if (updated.count === 0) throw new HierarchyStateConflictError("service is already deleted");
  });
}

const CLEAR = { deletedAt: null, deletedBatch: null };

export async function restoreCompany(id: string): Promise<RestoreCounts> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id } });
    if (!company) throw new HierarchyNotFoundError("company not found");
    if (!company.deletedAt) throw new HierarchyStateConflictError("company is not deleted");
    // No ancestor to check at the top level. Slug must be free among live rows.
    const taken = await tx.company.findFirst({
      where: { slug: company.slug, deletedAt: null }, select: { id: true },
    });
    if (taken) {
      throw new RestoreBlockedError("slugTaken", `a live company already uses the slug "${company.slug}"`);
    }
    const batch = company.deletedBatch;
    const products = batch ? await tx.product.updateMany({ where: { deletedBatch: batch }, data: CLEAR }) : { count: 0 };
    const services = batch ? await tx.service.updateMany({ where: { deletedBatch: batch }, data: CLEAR }) : { count: 0 };
    const updated = await tx.company.updateMany({ where: { id, deletedAt: { not: null } }, data: CLEAR });
    if (updated.count === 0) throw new HierarchyStateConflictError("company is not deleted");
    return { products: products.count, services: services.count };
  });
}

export async function restoreProduct(id: string): Promise<RestoreCounts> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product) throw new HierarchyNotFoundError("product not found");
    if (!product.deletedAt) throw new HierarchyStateConflictError("product is not deleted");
    const company = await tx.company.findUniqueOrThrow({ where: { id: product.companyId } });
    if (company.deletedAt) {
      throw new RestoreBlockedError("ancestorDeleted", `the company "${company.slug}" is deleted; restore it first`);
    }
    const taken = await tx.product.findFirst({
      where: { companyId: product.companyId, slug: product.slug, deletedAt: null }, select: { id: true },
    });
    if (taken) {
      throw new RestoreBlockedError("slugTaken", `a live product already uses the slug "${product.slug}" in this company`);
    }
    const batch = product.deletedBatch;
    const services = batch ? await tx.service.updateMany({ where: { deletedBatch: batch }, data: CLEAR }) : { count: 0 };
    const updated = await tx.product.updateMany({ where: { id, deletedAt: { not: null } }, data: CLEAR });
    if (updated.count === 0) throw new HierarchyStateConflictError("product is not deleted");
    return { services: services.count };
  });
}

export async function restoreService(id: string): Promise<RestoreCounts> {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({ where: { id } });
    if (!service) throw new HierarchyNotFoundError("service not found");
    if (!service.deletedAt) throw new HierarchyStateConflictError("service is not deleted");
    const product = await tx.product.findUniqueOrThrow({ where: { id: service.productId } });
    const company = await tx.company.findUniqueOrThrow({ where: { id: product.companyId } });
    // Name the outermost deleted ancestor: the company, if it too is deleted, is
    // the one the caller needs to restore first (restoring the product alone would
    // otherwise still leave the service unreachable, since the company stays
    // deleted). This is the common case, not an edge case: deleting a company
    // cascades to its services, so restoring a service directly after a
    // company-wide delete must name the company.
    if (company.deletedAt) {
      throw new RestoreBlockedError("ancestorDeleted", `the company "${company.slug}" is deleted; restore it first`);
    }
    if (product.deletedAt) {
      throw new RestoreBlockedError("ancestorDeleted", `the product "${product.slug}" is deleted; restore it first`);
    }
    const taken = await tx.service.findFirst({
      where: { productId: service.productId, slug: service.slug, deletedAt: null }, select: { id: true },
    });
    if (taken) {
      throw new RestoreBlockedError("slugTaken", `a live service already uses the slug "${service.slug}" in this product`);
    }
    const updated = await tx.service.updateMany({ where: { id, deletedAt: { not: null } }, data: CLEAR });
    if (updated.count === 0) throw new HierarchyStateConflictError("service is not deleted");
    return {};
  });
}
