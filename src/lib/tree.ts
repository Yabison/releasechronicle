import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { isAnonymous, getPublicEventTypes } from "@/lib/visibility";
import { SIDEBAR_TREE_TAG, SIDEBAR_TREE_TTL_SECONDS } from "@/lib/cache";

export type TreeService = {
  id: string; name: string; slug: string; type: string; isMaster: boolean;
  eventCount: number; upcomingMaintenanceCount: number; openIncidentCount: number;
};
export type TreeProduct = { id: string; name: string; slug: string; services: TreeService[] };
export type TreeCompany = { id: string; name: string; slug: string; products: TreeProduct[] };

export async function getSidebarTree(session: SessionUser | null = null): Promise<TreeCompany[]> {
  // Anonymous visitors only see entities flagged public (at every level) and only
  // event counts for the globally public event types.
  const anon = isAnonymous(session);
  const publicTypes = anon ? await getPublicEventTypes() : null;
  const pub = anon ? { public: true } : {};

  const companies = await prisma.company.findMany({
    where: { deletedAt: null, ...pub },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      products: {
        where: { deletedAt: null, ...pub },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          services: {
            where: { deletedAt: null, ...pub },
            orderBy: [{ isMaster: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
          },
        },
      },
    },
  });

  const now = new Date();
  const typeIn = publicTypes ? { type: { in: publicTypes as ("DEPLOYMENT" | "INCIDENT" | "MAINTENANCE")[] } } : {};
  const showMaint = !publicTypes || publicTypes.includes("MAINTENANCE");
  const showIncident = !publicTypes || publicTypes.includes("INCIDENT");
  const [allCounts, upcomingMaintCounts, openIncidentCounts] = await Promise.all([
    prisma.event.groupBy({ by: ["serviceId"], where: { deletedAt: null, ...typeIn }, _count: { _all: true } }),
    showMaint
      ? prisma.event.groupBy({
          by: ["serviceId"],
          where: { deletedAt: null, type: "MAINTENANCE", windowStart: { gt: now } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { serviceId: string; _count: { _all: number } }[]),
    showIncident
      ? prisma.event.groupBy({
          by: ["serviceId"],
          where: { deletedAt: null, type: "INCIDENT", resolvedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([] as { serviceId: string; _count: { _all: number } }[]),
  ]);
  const total = new Map(allCounts.map((c) => [c.serviceId, c._count._all]));
  const upcomingMaint = new Map(upcomingMaintCounts.map((c) => [c.serviceId, c._count._all]));
  const openIncidents = new Map(openIncidentCounts.map((c) => [c.serviceId, c._count._all]));

  return companies.map((c) => ({
    id: c.id, name: c.name, slug: c.slug,
    products: c.products.map((p) => ({
      id: p.id, name: p.name, slug: p.slug,
      services: p.services.map((s) => ({
        id: s.id, name: s.name, slug: s.slug, type: s.type, isMaster: s.isMaster,
        eventCount: total.get(s.id) ?? 0,
        upcomingMaintenanceCount: upcomingMaint.get(s.id) ?? 0,
        openIncidentCount: openIncidents.get(s.id) ?? 0,
      })),
    })),
  }));
}

/**
 * The sidebar tree as the layout should read it: cached, since the root layout
 * renders on every navigation and this query costs one nested hierarchy read plus
 * three grouped scans of the whole Event table.
 *
 * Two cache scopes only — anonymous and authenticated — because that is the whole
 * of what the tree depends on: `getSidebarTree` reads the session through
 * `isAnonymous` and nothing else, so every signed-in viewer shares one entry.
 *
 * Structure changes invalidate SIDEBAR_TREE_TAG on the spot (see hierarchy writes);
 * counters ride the TTL.
 */
export function getSidebarTreeCached(session: SessionUser | null = null): Promise<TreeCompany[]> {
  const scope = isAnonymous(session) ? "anon" : "auth";
  return unstable_cache(
    () => getSidebarTree(session),
    [SIDEBAR_TREE_TAG, scope],
    { revalidate: SIDEBAR_TREE_TTL_SECONDS, tags: [SIDEBAR_TREE_TAG] },
  )();
}
