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
 */

export type RestoreBlock = "ancestorDeleted" | "slugTaken";

export class RestoreBlockedError extends Error {
  constructor(readonly reason: RestoreBlock, message: string) {
    super(message);
    this.name = "RestoreBlockedError";
  }
}

export class AlreadyDeletedError extends Error {
  constructor(message = "already deleted") {
    super(message);
    this.name = "AlreadyDeletedError";
  }
}

export async function deleteCompany(id: string): Promise<{ products: number; services: number }> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!company) throw new AlreadyDeletedError("company not found");
    if (company.deletedAt) throw new AlreadyDeletedError();
    const stamp = { deletedAt: new Date(), deletedBatch: randomUUID() };
    const liveProducts = await tx.product.findMany({
      where: { companyId: id, deletedAt: null }, select: { id: true },
    });
    const productIds = liveProducts.map((p) => p.id);
    const services = productIds.length
      ? await tx.service.updateMany({ where: { productId: { in: productIds }, deletedAt: null }, data: stamp })
      : { count: 0 };
    const products = productIds.length
      ? await tx.product.updateMany({ where: { id: { in: productIds } }, data: stamp })
      : { count: 0 };
    await tx.company.update({ where: { id }, data: stamp });
    return { products: products.count, services: services.count };
  });
}

export async function deleteProduct(id: string): Promise<{ services: number }> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!product) throw new AlreadyDeletedError("product not found");
    if (product.deletedAt) throw new AlreadyDeletedError();
    const stamp = { deletedAt: new Date(), deletedBatch: randomUUID() };
    const services = await tx.service.updateMany({ where: { productId: id, deletedAt: null }, data: stamp });
    await tx.product.update({ where: { id }, data: stamp });
    return { services: services.count };
  });
}

export async function deleteService(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!service) throw new AlreadyDeletedError("service not found");
    if (service.deletedAt) throw new AlreadyDeletedError();
    await tx.service.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBatch: randomUUID() },
    });
  });
}

const CLEAR = { deletedAt: null, deletedBatch: null };

export async function restoreCompany(id: string): Promise<{ products: number; services: number }> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id } });
    if (!company || !company.deletedAt) throw new AlreadyDeletedError("company is not deleted");
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
    await tx.company.update({ where: { id }, data: CLEAR });
    return { products: products.count, services: services.count };
  });
}

export async function restoreProduct(id: string): Promise<{ services: number }> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product || !product.deletedAt) throw new AlreadyDeletedError("product is not deleted");
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
    await tx.product.update({ where: { id }, data: CLEAR });
    return { services: services.count };
  });
}

export async function restoreService(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({ where: { id } });
    if (!service || !service.deletedAt) throw new AlreadyDeletedError("service is not deleted");
    const product = await tx.product.findUniqueOrThrow({ where: { id: service.productId } });
    const company = await tx.company.findUniqueOrThrow({ where: { id: product.companyId } });
    // Name the outermost deleted ancestor: the company, if it too is deleted, is
    // the one the caller needs to restore first (restoring it would otherwise
    // still leave the product deleted).
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
    await tx.service.update({ where: { id }, data: CLEAR });
  });
}
