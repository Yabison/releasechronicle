import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPublicEventTypes } from "@/lib/visibility";
import { getPublicEnvSlugs } from "@/lib/environment";

/**
 * The queries behind the home / company / product dashboards.
 *
 * `anonymous` applies exactly the public-mode rules the rest of the app uses:
 * public hierarchy at every level, public environment, event type in the public
 * set. The dashboards are the first thing a demo visitor sees, so a leak here
 * would undo the API-side enforcement.
 */
export type OverviewScope = { company?: string; product?: string };

export type OverviewEventRow = {
  id: string;
  type: string;
  environment: string;
  occurredAt: string;
  version: string | null;
  deployStatus: string | null;
  changeType: string | null;
  incidentType: string | null;
  startedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  scheduledAt: string | null;
  comment: string | null;
  company: { slug: string; name: string };
  product: { slug: string; name: string };
  service: { slug: string; name: string };
};

export type Overview = {
  counters: { services: number; deploys30d: number; openIncidents: number; upcomingMaintenances: number };
  inFlight: OverviewEventRow[];
  openIncidents: OverviewEventRow[];
  upcomingMaintenances: OverviewEventRow[];
  recentDeployments: OverviewEventRow[];
};

/** Deploy statuses still moving through the workflow. */
const IN_FLIGHT = ["SCHEDULED", "GO_CONFIRMED", "PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING"] as const;
const RECENT_MS = 7 * 86_400_000;

const INCLUDE = {
  service: {
    select: {
      slug: true, name: true,
      product: { select: { slug: true, name: true, company: { select: { slug: true, name: true } } } },
    },
  },
} satisfies Prisma.EventInclude;

type Row = Prisma.EventGetPayload<{ include: typeof INCLUDE }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toRow(e: Row): OverviewEventRow {
  return {
    id: e.id,
    type: e.type,
    environment: e.environment,
    occurredAt: e.occurredAt.toISOString(),
    version: e.version,
    deployStatus: e.deployStatus,
    changeType: e.changeType,
    incidentType: e.incidentType,
    startedAt: iso(e.startedAt),
    windowStart: iso(e.windowStart),
    windowEnd: iso(e.windowEnd),
    scheduledAt: iso(e.scheduledAt),
    comment: e.comment,
    company: e.service.product.company,
    product: { slug: e.service.product.slug, name: e.service.product.name },
    service: { slug: e.service.slug, name: e.service.name },
  };
}

export async function getOverview(scope: OverviewScope, anonymous: boolean): Promise<Overview> {
  const [types, envs] = anonymous
    ? await Promise.all([getPublicEventTypes(), getPublicEnvSlugs()])
    : [null, null];
  const pub = anonymous ? { public: true } : {};
  const allowed = (type: string) => !types || types.includes(type);

  const serviceWhere: Prisma.ServiceWhereInput = {
    deletedAt: null,
    ...pub,
    product: {
      deletedAt: null,
      ...pub,
      ...(scope.product ? { slug: scope.product } : {}),
      company: { deletedAt: null, ...pub, ...(scope.company ? { slug: scope.company } : {}) },
    },
  };
  const base: Prisma.EventWhereInput = {
    deletedAt: null,
    service: serviceWhere,
    ...(envs ? { environment: { in: envs } } : {}),
  };
  const now = new Date();

  const [services, deploys30d, openIncidentCount, upcomingCount, inFlight, openIncidents, upcoming, recent] =
    await Promise.all([
      prisma.service.count({ where: serviceWhere }),
      allowed("DEPLOYMENT")
        ? prisma.event.count({ where: { ...base, type: "DEPLOYMENT", occurredAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } })
        : 0,
      allowed("INCIDENT")
        ? prisma.event.count({ where: { ...base, type: "INCIDENT", resolvedAt: null } })
        : 0,
      allowed("MAINTENANCE")
        ? prisma.event.count({ where: { ...base, type: "MAINTENANCE", windowStart: { gt: now } } })
        : 0,
      allowed("DEPLOYMENT")
        ? prisma.event.findMany({
            where: {
              ...base, type: "DEPLOYMENT",
              deployStatus: { in: [...IN_FLIGHT] },
              // Old unfinished deployments are history, not "in flight" — same
              // cutoff the demo ticker uses. Future SCHEDULED ones stay.
              OR: [
                { occurredAt: { gte: new Date(now.getTime() - RECENT_MS) } },
                { scheduledAt: { gt: now } },
              ],
            },
            orderBy: { occurredAt: "desc" }, take: 8, include: INCLUDE,
          })
        : [],
      allowed("INCIDENT")
        ? prisma.event.findMany({
            where: { ...base, type: "INCIDENT", resolvedAt: null },
            orderBy: { startedAt: "desc" }, take: 8, include: INCLUDE,
          })
        : [],
      allowed("MAINTENANCE")
        ? prisma.event.findMany({
            where: { ...base, type: "MAINTENANCE", windowStart: { gt: now } },
            orderBy: { windowStart: "asc" }, take: 5, include: INCLUDE,
          })
        : [],
      allowed("DEPLOYMENT")
        ? prisma.event.findMany({
            where: { ...base, type: "DEPLOYMENT" },
            orderBy: { occurredAt: "desc" }, take: 10, include: INCLUDE,
          })
        : [],
    ]);

  return {
    counters: { services, deploys30d, openIncidents: openIncidentCount, upcomingMaintenances: upcomingCount },
    inFlight: inFlight.map(toRow),
    openIncidents: openIncidents.map(toRow),
    upcomingMaintenances: upcoming.map(toRow),
    recentDeployments: recent.map(toRow),
  };
}

/** Company for a dashboard page: null when absent or hidden from this caller. */
export async function findVisibleCompany(slug: string, anonymous: boolean) {
  return prisma.company.findFirst({
    where: { slug, deletedAt: null, ...(anonymous ? { public: true } : {}) },
    select: { slug: true, name: true },
  });
}

/** Product for a dashboard page: null when absent or hidden from this caller. */
export async function findVisibleProduct(companySlug: string, productSlug: string, anonymous: boolean) {
  const pub = anonymous ? { public: true } : {};
  return prisma.product.findFirst({
    where: { slug: productSlug, deletedAt: null, ...pub, company: { slug: companySlug, deletedAt: null, ...pub } },
    select: { slug: true, name: true, company: { select: { slug: true, name: true } } },
  });
}
