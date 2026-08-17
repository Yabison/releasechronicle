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
  requester: string | null;
  resolvedAt: string | null;
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
  /** One feed, newest first, capped: the dashboard list filters it client-side. */
  events: OverviewEventRow[];
};

/** The feed window: everything from the last 3 months, plus anything scheduled ahead. */
const WINDOW_MS = 90 * 86_400_000;
const FEED_CAP = 300;

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
    requester: e.requester,
    resolvedAt: iso(e.resolvedAt),
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
  // The anonymous type restriction: `base` cannot carry `type` because the
  // per-query type below would overwrite it in a spread.
  const typeIn = types ? { type: { in: types as ("DEPLOYMENT" | "INCIDENT" | "MAINTENANCE")[] } } : {};

  const [services, deploys30d, openIncidentCount, upcomingCount, feed] = await Promise.all([
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
    prisma.event.findMany({
      where: { ...base, ...typeIn, occurredAt: { gte: new Date(now.getTime() - WINDOW_MS) } },
      orderBy: { occurredAt: "desc" },
      take: FEED_CAP,
      include: INCLUDE,
    }),
  ]);

  return {
    counters: { services, deploys30d, openIncidents: openIncidentCount, upcomingMaintenances: upcomingCount },
    events: feed.map(toRow),
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
