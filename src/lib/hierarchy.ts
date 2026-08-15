import type { ServiceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";

// Note: the create* functions derive a unique slug then create in two steps,
// which is not atomic. Concurrent creates with the same name can both pass the
// slug check; the @@unique constraints are the real backstop and will reject the
// loser with a Prisma P2002 error. Callers (API routes) should expect that and
// surface it gracefully rather than letting it 500. Low risk for this
// token-gated, low-concurrency tool, so no retry loop is added here.

export async function createCompany(input: { name: string }) {
  const slug = await uniqueSlug(input.name, async (s) =>
    (await prisma.company.count({ where: { slug: s } })) > 0,
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

export async function softDeleteCompany(id: string) {
  return prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function createProduct(input: { companyId: string; name: string }) {
  const slug = await uniqueSlug(input.name, async (s) =>
    (await prisma.product.count({ where: { companyId: input.companyId, slug: s } })) > 0,
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

export async function softDeleteProduct(id: string) {
  return prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
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
    (await prisma.service.count({ where: { productId: input.productId, slug: s } })) > 0,
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

export async function softDeleteService(id: string) {
  return prisma.service.update({ where: { id }, data: { deletedAt: new Date() } });
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
