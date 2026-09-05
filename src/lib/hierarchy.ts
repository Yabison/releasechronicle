import type { ServiceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";
import { afterTreeChange } from "@/lib/cache";

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
  return afterTreeChange(prisma.company.create({ data: { name: input.name, slug, sortOrder: (max._max.sortOrder ?? -1) + 1 } }));
}

/**
 * `publicOnly` narrows the listing to public rows for anonymous API callers.
 * `includeDeleted` drops the deletedAt filter entirely (admin-only restore UI);
 * it defaults to false so every existing caller keeps seeing only live rows.
 */
export function listCompanies(publicOnly: boolean = false, includeDeleted: boolean = false) {
  return prisma.company.findMany({
    where: { ...(includeDeleted ? {} : { deletedAt: null }), ...(publicOnly ? { public: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Update a company's display order. */
export function updateCompanyOrder(id: string, sortOrder: number) {
  return afterTreeChange(prisma.company.update({ where: { id }, data: { sortOrder } }));
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
 *
 * `nulls: "last"` is required, not cosmetic: Postgres sorts NULL first under a
 * plain DESC order, so a plain `{ deletedAt: "desc" }` would put a LIVE row
 * (deletedAt: null) ahead of every deleted one whenever a new row has since
 * reclaimed the slug — exactly the case the restore path must detect (a live
 * row already holds the slug) rather than paper over by resolving to it.
 */
export function getCompanyBySlugIncludingDeleted(slug: string) {
  return prisma.company.findFirst({ where: { slug }, orderBy: { deletedAt: { sort: "desc", nulls: "last" } } });
}

/** The named parent (company/product) for a create or move is missing or itself
 *  soft-deleted. Without this check a stale admin request (or a crafted one) can
 *  reparent/create under a deleted row, producing an orphan that is invisible and
 *  undeletable through the API — every slug resolver walks through a live-only
 *  parent, so GET/PUT/DELETE on it all 404 — while its events keep flowing into
 *  the read-side aggregates, which trust the invariant that a live service always
 *  has a live product and company. */
export class InvalidParentError extends Error {}

export async function createProduct(input: { companyId: string; name: string }) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { deletedAt: true } });
  if (!company || company.deletedAt) {
    throw new InvalidParentError(`company '${input.companyId}' not found or deleted`);
  }
  const slug = await uniqueSlug(input.name, async (s) =>
    (await prisma.product.count({ where: { companyId: input.companyId, slug: s, deletedAt: null } })) > 0,
  );
  const max = await prisma.product.aggregate({ where: { companyId: input.companyId }, _max: { sortOrder: true } });
  return afterTreeChange(prisma.product.create({
    data: { name: input.name, slug, companyId: input.companyId, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  }));
}

export function listProducts(companyId: string, publicOnly: boolean = false, includeDeleted: boolean = false) {
  return prisma.product.findMany({
    where: {
      companyId,
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(publicOnly ? { public: true, company: { public: true } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getProductBySlug(companySlug: string, productSlug: string) {
  // One nested filter, not a walk: the live-parent rule is the same either way
  // (product AND company must both be live), and this resolver sits on the hot
  // path of every ingest request.
  return prisma.product.findFirst({
    where: { slug: productSlug, deletedAt: null, company: { slug: companySlug, deletedAt: null } },
  });
}

/**
 * Restore-path only: resolves a product by slug WITHOUT filtering deletedAt,
 * chaining through the deleted-inclusive company resolver so a product can be
 * found even while its company is also soft-deleted. The normal `getProductBySlug`
 * above must keep filtering deletedAt: null.
 *
 * Ordered by deletedAt desc (nulls last, see the company variant above) for the
 * same reason: several deleted products can share a slug under a partial unique
 * index, and "restore the thing I just deleted" is the useful default — but a
 * live row that has since reclaimed the slug must still win the lookup so the
 * restore path can report the collision instead of silently resolving to it.
 */
export async function getProductBySlugIncludingDeleted(companySlug: string, productSlug: string) {
  const company = await getCompanyBySlugIncludingDeleted(companySlug);
  if (!company) return null;
  return prisma.product.findFirst({
    where: { companyId: company.id, slug: productSlug },
    orderBy: { deletedAt: { sort: "desc", nulls: "last" } },
  });
}

/** Update a product's editable fields (env workflow, display order). */
export function updateProduct(id: string, data: { envWorkflow?: string[]; sortOrder?: number; public?: boolean }) {
  return afterTreeChange(prisma.product.update({ where: { id }, data }));
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
      return afterTreeChange(prisma.$transaction(async (tx) => {
        await tx.service.updateMany({
          where: { productId: svc.productId, isMaster: true, NOT: { id } },
          data: { isMaster: false },
        });
        return tx.service.update({ where: { id }, data });
      }));
    }
  }
  return afterTreeChange(prisma.service.update({ where: { id }, data }));
}

export async function createService(input: {
  productId: string;
  name: string;
  type: ServiceType;
}) {
  const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { deletedAt: true } });
  if (!product || product.deletedAt) {
    throw new InvalidParentError(`product '${input.productId}' not found or deleted`);
  }
  const slug = await uniqueSlug(input.name, async (s) =>
    (await prisma.service.count({ where: { productId: input.productId, slug: s, deletedAt: null } })) > 0,
  );
  const max = await prisma.service.aggregate({ where: { productId: input.productId }, _max: { sortOrder: true } });
  return afterTreeChange(prisma.service.create({
    data: { name: input.name, slug, type: input.type, productId: input.productId, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  }));
}

export function listServices(productId: string, publicOnly: boolean = false, includeDeleted: boolean = false) {
  return prisma.service.findMany({
    where: {
      productId,
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(publicOnly ? { public: true, product: { public: true, company: { public: true } } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getServiceBySlug(
  companySlug: string,
  productSlug: string,
  serviceSlug: string,
) {
  return prisma.service.findFirst({ where: liveServiceWhere({ company: companySlug, product: productSlug, service: serviceSlug }) });
}

/** A company/product/service slug triple, as the REST bodies and Excel rows carry it. */
export type ServiceRef = { company: string; product: string; service: string };

/** Key a ServiceRef takes in the map `getServicesBySlugs` returns. */
export function serviceRefKey(ref: ServiceRef): string {
  return `${ref.company}/${ref.product}/${ref.service}`;
}

function liveServiceWhere(ref: ServiceRef) {
  return {
    slug: ref.service, deletedAt: null,
    product: { slug: ref.product, deletedAt: null, company: { slug: ref.company, deletedAt: null } },
  };
}

/**
 * Resolve many slug triples in ONE query, keyed by `serviceRefKey`. For bulk
 * callers (the Excel import) that would otherwise resolve a service per row.
 * Missing and soft-deleted triples are simply absent from the map.
 */
export async function getServicesBySlugs(refs: ServiceRef[]): Promise<Map<string, { id: string }>> {
  const byKey = new Map(refs.map((r) => [serviceRefKey(r), r]));
  if (byKey.size === 0) return new Map();
  const rows = await prisma.service.findMany({
    where: { OR: [...byKey.values()].map(liveServiceWhere) },
    select: { id: true, slug: true, product: { select: { slug: true, company: { select: { slug: true } } } } },
  });
  return new Map(
    rows.map((r) => [
      serviceRefKey({ company: r.product.company.slug, product: r.product.slug, service: r.slug }),
      { id: r.id },
    ]),
  );
}

/**
 * Restore-path only: resolves a service by slug WITHOUT filtering deletedAt,
 * chaining through the deleted-inclusive product resolver so a service can be
 * found even while its product and/or company are also soft-deleted. The normal
 * `getServiceBySlug` above must keep filtering deletedAt: null.
 *
 * Ordered by deletedAt desc (nulls last, see the company variant above) for the
 * same reason as the company/product variants: several deleted services can
 * share a slug under a partial unique index, and "restore the thing I just
 * deleted" is the useful default — but a live row that has since reclaimed the
 * slug must still win the lookup so the restore path can report the collision.
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
    orderBy: { deletedAt: { sort: "desc", nulls: "last" } },
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
  const targetProduct = await prisma.product.findUnique({ where: { id: targetProductId }, select: { deletedAt: true } });
  if (!targetProduct || targetProduct.deletedAt) {
    throw new InvalidParentError(`target product '${targetProductId}' not found or deleted`);
  }
  const clash = await prisma.service.count({ where: { productId: targetProductId, slug: svc.slug, deletedAt: null, NOT: { id: serviceId } } });
  if (clash > 0) throw new SlugConflictError(`a service '${svc.slug}' already exists in the target product`);
  return afterTreeChange(prisma.service.update({ where: { id: serviceId }, data: { productId: targetProductId } }));
}

/** Move a product under a different company. Throws SlugConflictError if the target
 *  company already has a product with the same slug. Returns null if not found. */
export async function moveProduct(productId: string, targetCompanyId: string) {
  const prod = await prisma.product.findUnique({ where: { id: productId } });
  if (!prod) return null;
  const targetCompany = await prisma.company.findUnique({ where: { id: targetCompanyId }, select: { deletedAt: true } });
  if (!targetCompany || targetCompany.deletedAt) {
    throw new InvalidParentError(`target company '${targetCompanyId}' not found or deleted`);
  }
  const clash = await prisma.product.count({ where: { companyId: targetCompanyId, slug: prod.slug, deletedAt: null, NOT: { id: productId } } });
  if (clash > 0) throw new SlugConflictError(`a product '${prod.slug}' already exists in the target company`);
  return afterTreeChange(prisma.product.update({ where: { id: productId }, data: { companyId: targetCompanyId } }));
}
