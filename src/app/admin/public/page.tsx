import { prisma } from "@/lib/db";
import { listEnvironments } from "@/lib/environment";
import { getPublicEventTypes, getChangelogVisibility } from "@/lib/visibility";
import { PublicConfig } from "@/components/PublicConfig";

export const dynamic = "force-dynamic";

export default async function AdminPublicPage() {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      products: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          services: { where: { deletedAt: null }, orderBy: [{ name: "asc" }] },
        },
      },
    },
  });
  const tree = companies.map((c) => ({
    slug: c.slug, name: c.name, public: c.public,
    products: c.products.map((p) => ({
      slug: p.slug, name: p.name, public: p.public,
      services: p.services.map((s) => ({ slug: s.slug, name: s.name, public: s.public })),
    })),
  }));
  const envs = (await listEnvironments()).map((e) => ({ id: e.id, slug: e.slug, name: e.name, public: e.public }));
  const eventTypes = await getPublicEventTypes();
  const changelogVisibility = await getChangelogVisibility();

  return <PublicConfig tree={tree} envs={envs} eventTypes={eventTypes} changelogVisibility={changelogVisibility} />;
}
