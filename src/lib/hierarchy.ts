import type { ServiceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";

// Note: the create* functions derive a unique slug then create in two steps,
// which is not atomic. Concurrent creates with the same name can both pass the
// slug check; the real backstop is now a PARTIAL unique index (WHERE "deletedAt"
// IS NULL) and will reject the loser with a Prisma P2002 error. Callers (API
// routes) should expect that and surface it gracefully rather than letting it
// 500. Low risk for this token-gated, low-concurrency tool, so no retry loop is
// added here. Because the backstop is partial, it agrees with the deletedAt:
// null filters below and with the move-clash checks (which already filtered
// deletedAt) — a soft-deleted row no longer squats its slug either in the app's
// eyes or the database's.

export async function createCompany(input: { name: string }) {
  const slug = await uniqueSlug(input.name, async (s) =>
    (await prisma.company.count({ where: { slug: s, deletedAt: null } })) > 0,
  );
  const max = await prisma.company.aggregate({ _max: { sortOrder: true } });
  return prisma.company.create({ data: { name: input.name, slug, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
}

/** `publicOnly` narrows the listing to public rows for anonymous API callers. */
export function listCompanies(publicOnly: boolean = false) {
  return prisma.company.findMany({
    where: { deletedAt: null, ...(publicOnly ? { public: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Update a company's display order. */
export function updateCompanyOrder(id: string, sortOrder: number) {
  return prisma.company.update({ where: { id }, data: { sortOrder } });
}

export function getCompanyBySlug(slug: string) {
  return prisma.company.findFirst({ where: { slug, deletedAt: null } });
}

/**
 * Restore-path only: resolves a company by slug WITHOUT filtering deletedAt, so a
 * soft-deleted row can still be found and offered for restoration. The normal
 * `getCompanyBySlug` above must keep filtering deletedAt: null.
 *
 * A partial unique index only enforces uniqueness among LIVE rows, so several
 * deleted companies can share a slug. Ordering by deletedAt desc picks the most
 * recently deleted one — the useful default for "restore the thing I just deleted".
 */
export function getCompanyBySlugIncludingDeleted(slug: string) {
  return prisma.company.findFirst({ where: { slug }, orderBy: { deletedAt: "desc" } });
}

export async function createProduct(input: { companyId: string; name: string }) {
  const slug = await uniqueSlug(input.name, async (s) =>
    (await prisma.product.count({ where: { companyId: input.companyId, slug: s, deletedAt: null } })) > 0,
  );
  const max = await prisma.product.aggregate({ where: { companyId: input.companyId }, _max: { sortOrder: true } });
  return prisma.product.create({
    data: { name: input.name, slug, companyId: input.companyId, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
}

export function listProducts(companyId: string, publicOnly: boolean = false) {
  return prisma.product.findMany({
    where: {
      companyId, deletedAt: null,
      ...(publicOnly ? { public: true, company: { public: true } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getProductBySlug(companySlug: string, productSlug: string) {
  const company = await getCompanyBySlug(companySlug);
  if (!company) return null;
  return prisma.product.findFirst({
    where: { companyId: company.id, slug: productSlug, deletedAt: null },
  });
}

/**
 * Restore-path only: resolves a product by slug WITHOUT filtering deletedAt,
 * chaining through the deleted-inclusive company resolver so a product can be
 * found even while its company is also soft-deleted. The normal `getProductBySlug`
 * above must keep filtering deletedAt: null.
 *
 * Ordered by deletedAt desc for the same reason as the company variant: several
 * deleted products can share a slug under a partial unique index, and "restore the
 * thing I just deleted" is the useful default.
 */
export async function getProductBySlugIncludingDeleted(companySlug: string, productSlug: string) {
  const company = await getCompanyBySlugIncludingDeleted(companySlug);
  if (!company) return null;
  return prisma.product.findFirst({
    where: { companyId: company.id, slug: productSlug },
    orderBy: { deletedAt: "desc" },
  });
}

/** Update a product's editable fields (env workflow, display order). */
export function updateProduct(id: string, data: { envWorkflow?: string[]; sortOrder?: number; public?: boolean }) {
  return prisma.product.update({ where: { id }, data });
}

/**
 * Update a service's editable fields (build-URL template, master flag).
 * Master is exclusive per product: setting isMaster=true demotes its siblings so a
 * product has at most one main app; the rest are its dependencies.
 */
export async function updateService(
  id: string,
  data: { buildUrlTemplate?: string | null; isMaster?: boolean; envWorkflow?: string[]; envWorkflowOverride?: boolean; sortOrder?: number; public?: boolean },
) {
  if (data.isMaster === true) {
    const svc = await prisma.service.findUnique({ where: { id }, select: { productId: true } });
    if (svc) {
      return prisma.$transaction(async (tx) => {
        await tx.service.updateMany({
          where: { productId: svc.productId, isMaster: true, NOT: { id } },
          data: { isMaster: false },
        });
        return tx.service.update({ where: { id }, data });
      });
    }
  }
  return prisma.service.update({ where: { id }, data });
}

export async function createService(input: {
  productId: string;
  name: string;
  type: ServiceType;
}) {
  const slug = await uniqueSlug(input.name, async (s) =>
    (await prisma.service.count({ where: { productId: input.productId, slug: s, deletedAt: null } })) > 0,
  );
  const max = await prisma.service.aggregate({ where: { productId: input.productId }, _max: { sortOrder: true } });
  return prisma.service.create({
    data: { name: input.name, slug, type: input.type, productId: input.productId, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
}

export function listServices(productId: string, publicOnly: boolean = false) {
  return prisma.service.findMany({
    where: {
      productId, deletedAt: null,
      ...(publicOnly ? { public: true, product: { public: true, company: { public: true } } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getServiceBySlug(
  companySlug: string,
  productSlug: string,
  serviceSlug: string,
) {
  const product = await getProductBySlug(companySlug, productSlug);
  if (!product) return null;
  return prisma.service.findFirst({
    where: { productId: product.id, slug: serviceSlug, deletedAt: null },
  });
}

/**
 * Restore-path only: resolves a service by slug WITHOUT filtering deletedAt,
 * chaining through the deleted-inclusive product resolver so a service can be
 * found even while its product and/or company are also soft-deleted. The normal
 * `getServiceBySlug` above must keep filtering deletedAt: null.
 *
 * Ordered by deletedAt desc for the same reason as the company/product variants:
 * several deleted services can share a slug under a partial unique index, and
 * "restore the thing I just deleted" is the useful default.
 */
export async function getServiceBySlugIncludingDeleted(
  companySlug: string,
  productSlug: string,
  serviceSlug: string,
) {
  const product = await getProductBySlugIncludingDeleted(companySlug, productSlug);
  if (!product) return null;
  return prisma.service.findFirst({
    where: { productId: product.id, slug: serviceSlug },
    orderBy: { deletedAt: "desc" },
  });
}

/** A service's effective env workflow: its own when overriding, else the product's (inherited). */
export function effectiveEnvWorkflow(
  service: { envWorkflow: string[]; envWorkflowOverride: boolean },
  product: { envWorkflow: string[] } | null,
): string[] {
  return service.envWorkflowOverride ? service.envWorkflow : (product?.envWorkflow ?? []);
}

export class SlugConflictError extends Error {}

/** Move a service under a different product. Throws SlugConflictError if the target
 *  product already has a service with the same slug. Returns null if not found. */
export async function moveService(serviceId: string, targetProductId: string) {
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc) return null;
  const clash = await prisma.service.count({ where: { productId: targetProductId, slug: svc.slug, deletedAt: null, NOT: { id: serviceId } } });
  if (clash > 0) throw new SlugConflictError(`a service '${svc.slug}' already exists in the target product`);
  return prisma.service.update({ where: { id: serviceId }, data: { productId: targetProductId } });
}

/** Move a product under a different company. Throws SlugConflictError if the target
 *  company already has a product with the same slug. Returns null if not found. */
export async function moveProduct(productId: string, targetCompanyId: string) {
  const prod = await prisma.product.findUnique({ where: { id: productId } });
  if (!prod) return null;
  const clash = await prisma.product.count({ where: { companyId: targetCompanyId, slug: prod.slug, deletedAt: null, NOT: { id: productId } } });
  if (clash > 0) throw new SlugConflictError(`a product '${prod.slug}' already exists in the target company`);
  return prisma.product.update({ where: { id: productId }, data: { companyId: targetCompanyId } });
}
