import type { PrismaClient, ServiceType } from "@prisma/client";
import { slugify } from "../../src/lib/slug";

/**
 * Company/product/service + environment builder shared by every seeder.
 *
 * Holds no names of its own: the demo seeder and the private one both hand it a
 * description, which is what keeps customer data out of the repository.
 */
export type ProductSeed = {
  name: string;
  /** Main service of the product; its siblings are treated as dependencies. */
  master?: string;
  envWorkflow?: string[];
  buildUrlTemplate?: string;
  services: string[];
  public?: boolean;
};
export type CompanySeed = { name: string; products: ProductSeed[]; public?: boolean };
export type EnvSeed = { slug: string; color: string; public?: boolean };
export type GroupSeed = { slug: string; name: string; members: string[] };

export type HierarchySeed = {
  environments: EnvSeed[];
  environmentGroups?: GroupSeed[];
  companies: CompanySeed[];
};

export type SeededHierarchy = {
  /** Service slug -> id. Service slugs are unique here, which lets an importer
   *  route a spreadsheet row straight to a service. */
  serviceBySlug: Map<string, string>;
  companies: number;
  products: number;
  services: number;
};

export async function seedHierarchy(prisma: PrismaClient, seed: HierarchySeed): Promise<SeededHierarchy> {
  for (let i = 0; i < seed.environments.length; i++) {
    const e = seed.environments[i];
    await prisma.environmentConfig.upsert({
      where: { slug: e.slug },
      create: { slug: e.slug, name: e.slug, color: e.color, sortOrder: i, public: e.public ?? false },
      update: {},
    });
  }

  for (let i = 0; i < (seed.environmentGroups ?? []).length; i++) {
    const g = seed.environmentGroups![i];
    await prisma.environmentGroup.create({
      data: { slug: g.slug, name: g.name, members: g.members, sortOrder: i },
    });
  }

  const serviceBySlug = new Map<string, string>();
  let products = 0;
  let services = 0;

  for (let ci = 0; ci < seed.companies.length; ci++) {
    const company = seed.companies[ci];
    const c = await prisma.company.create({
      data: { name: company.name, slug: slugify(company.name), sortOrder: ci, public: company.public ?? false },
    });
    for (let pi = 0; pi < company.products.length; pi++) {
      const product = company.products[pi];
      const p = await prisma.product.create({
        data: {
          name: product.name,
          slug: slugify(product.name),
          companyId: c.id,
          envWorkflow: product.envWorkflow ?? [],
          sortOrder: pi,
          public: product.public ?? company.public ?? false,
        },
      });
      products++;
      for (let si = 0; si < product.services.length; si++) {
        const svc = product.services[si];
        const s = await prisma.service.create({
          data: {
            name: svc,
            slug: slugify(svc),
            type: "APP" as ServiceType,
            productId: p.id,
            isMaster: svc === product.master,
            sortOrder: si,
            public: product.public ?? company.public ?? false,
            ...(product.buildUrlTemplate ? { buildUrlTemplate: product.buildUrlTemplate } : {}),
          },
        });
        serviceBySlug.set(s.slug, s.id);
        services++;
      }
    }
  }

  return { serviceBySlug, companies: seed.companies.length, products, services };
}
