import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FEED_INCLUDE, deriveFor } from "@/lib/events";
import { toClientEvents, type ClientEvent } from "@/lib/timeline";
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

/**
 * A dashboard row is a full ClientEvent plus where it lives. Same shape as a
 * service feed, so the dashboards can run buildServiceTimeline and render the
 * very same TimelineRow instead of keeping a thinner second row model that
 * silently lacked rollbacks, lots, tags and durations.
 */
export type OverviewEventRow = ClientEvent & {
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
  ...FEED_INCLUDE,
  service: {
    select: {
      slug: true, name: true,
      product: { select: { slug: true, name: true, company: { select: { slug: true, name: true } } } },
    },
  },
} satisfies Prisma.EventInclude;

type Row = Prisma.EventGetPayload<{ include: typeof INCLUDE }>;

function toRow(e: Row, now: Date): OverviewEventRow {
  const [event] = toClientEvents([{ ...e, derived: deriveFor(e, now) } as unknown as Record<string, unknown>]);
  return {
    ...event,
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
    events: feed.map((e) => toRow(e, now)),
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

/**
 * The per-row extras a dashboard needs to render the same TimelineRow as the
 * service page: environment colours, and the lot membership behind the lot
 * badge and the "incomplete lot rollback" alert.
 *
 * Kept here rather than repeated in the three dashboard pages, which differ
 * only by their scope.
 */
export async function getOverviewExtras(events: OverviewEventRow[]) {
  const { resolveEnvColorMap } = await import("@/lib/environment");
  const { getLotMembers, lotRollbackWarnings } = await import("@/lib/deployLot");
  const lots = [...new Set(events.map((e) => e.lot).filter((l): l is string => !!l))];
  const [envColors, lotMembers] = await Promise.all([resolveEnvColorMap(), getLotMembers(lots)]);
  return { envColors, lotMembers, lotWarnings: lotRollbackWarnings(lotMembers) };
}
