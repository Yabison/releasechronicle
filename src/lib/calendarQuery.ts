import type { Prisma, EventType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CalItem } from "@/lib/ics";
import { calendarPastDays, calendarFutureDays } from "@/lib/deployConfig";
import { log } from "@/lib/log";

export type CalendarFilter = {
  company?: string; product?: string; service?: string; environment?: string; types?: string[];
  /** Anonymous caller: restrict to public hierarchies, environments and event types. */
  publicScope?: { envs: string[]; types: string[] };
};

const HALF_HOUR = 30 * 60_000;
const ONE_HOUR = 60 * 60_000;

const DEFAULT_TYPES = ["DEPLOYMENT", "MAINTENANCE"];
const VALID_TYPES = ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"];
const DAY = 24 * 60 * 60_000;

/**
 * Safety net, not a feature: what bounds a feed is the time window below. Should a
 * window ever hold more than this, the feed is cut AND the cut is logged — silent
 * truncation is the one failure a calendar subscriber cannot see for themselves.
 */
export const CALENDAR_ITEM_CAP = 1000;

/**
 * A subscribed calendar does not need the whole history, and a feed unbounded in
 * time grows until it reaches the row cap. An event is inside the window when ANY
 * of its three display dates is: a maintenance is placed by its window, a
 * scheduled deployment by scheduledAt, everything else by occurredAt.
 */
function windowClause(now: Date): Prisma.EventWhereInput[] {
  const range = {
    gte: new Date(now.getTime() - calendarPastDays() * DAY),
    lte: new Date(now.getTime() + calendarFutureDays() * DAY),
  };
  return [{ occurredAt: range }, { windowStart: range }, { scheduledAt: range }];
}

function buildWhere(filter: CalendarFilter): Prisma.EventWhereInput {
  const types = (filter.types?.length ? filter.types : DEFAULT_TYPES).filter((t) => VALID_TYPES.includes(t));
  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    type: { in: (types.length ? types : DEFAULT_TYPES) as EventType[] },
    OR: windowClause(new Date()),
  };
  if (filter.environment) where.environment = filter.environment as Prisma.EventWhereInput["environment"];
  const product: Prisma.ProductWhereInput = {};
  if (filter.company) product.company = { slug: filter.company };
  if (filter.product) product.slug = filter.product;
  const service: Prisma.ServiceWhereInput = { deletedAt: null };
  if (filter.service) service.slug = filter.service;
  if (filter.publicScope) {
    // Narrowed, never widened: a feed asking for INCIDENT still only gets the
    // types public mode exposes.
    const allowedTypes = types.filter((t) => filter.publicScope!.types.includes(t));
    where.type = { in: allowedTypes as EventType[] };
    const asked = filter.environment;
    const envs = asked ? (filter.publicScope.envs.includes(asked) ? [asked] : []) : filter.publicScope.envs;
    where.environment = { in: envs };
    const company: Prisma.CompanyWhereInput = { public: true, ...(filter.company ? { slug: filter.company } : {}) };
    service.public = true;
    service.product = { public: true, company, ...(filter.product ? { slug: filter.product } : {}) };
    where.service = service;
    return where;
  }
  if (Object.keys(product).length) service.product = product;
  where.service = service;
  return where;
}

/** Fetch scoped deployments + maintenances and map them to calendar items. */
export async function queryCalendar(filter: CalendarFilter): Promise<CalItem[]> {
  // One row over the cap, purely to tell a full feed from a truncated one.
  const fetched = await prisma.event.findMany({
    where: buildWhere(filter),
    include: { service: { include: { product: { include: { company: true } } } } },
    orderBy: { occurredAt: "desc" },
    take: CALENDAR_ITEM_CAP + 1,
  });
  const truncated = fetched.length > CALENDAR_ITEM_CAP;
  const rows = truncated ? fetched.slice(0, CALENDAR_ITEM_CAP) : fetched;
  if (truncated) {
    log.warn("calendar feed truncated at the row cap", {
      mod: "calendar",
      cap: CALENDAR_ITEM_CAP,
      company: filter.company,
      product: filter.product,
      service: filter.service,
      environment: filter.environment,
    });
  }

  return rows.map((e) => {
    const where = `${e.service.product.slug}/${e.service.slug} (${e.environment})`;
    const uid = `${e.id}@releasechronicle`;
    if (e.type === "MAINTENANCE") {
      const start = e.windowStart ?? e.occurredAt;
      const end = e.windowEnd ?? new Date(start.getTime() + ONE_HOUR);
      return { uid, start, end, summary: `[Maintenance] ${where}`, description: e.comment ?? undefined };
    }
    if (e.type === "INCIDENT") {
      const start = e.startedAt ?? e.occurredAt;
      const end = e.resolvedAt ?? new Date(start.getTime() + ONE_HOUR);
      return { uid, start, end, summary: `[Incident] ${where}`, description: e.comment ?? undefined };
    }
    // DEPLOYMENT (or HOTFIX)
    const start = e.scheduledAt ?? e.occurredAt;
    const end = new Date(start.getTime() + HALF_HOUR);
    const label = e.changeType === "HOTFIX" ? "HOTFIX" : "MEP";
    const summary = `[${label}] ${where}${e.version ? ` ${e.version}` : ""}`;
    const desc = [
      e.deployStatus ? `statut ${e.deployStatus}` : null,
      e.requester ? `par ${e.requester}` : null,
      e.lot ? `lot ${e.lot}` : null,
    ].filter(Boolean).join(" · ");
    return { uid, start, end, summary, description: desc || undefined };
  });
}
