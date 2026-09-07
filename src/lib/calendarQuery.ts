import type { Prisma, EventType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CalItem } from "@/lib/ics";
import { calendarPastDays, calendarFutureDays } from "@/lib/deployConfig";
import { resolveEnvGroupMembers } from "@/lib/environment";
import { lotKey } from "@/lib/deployLot";
import { log } from "@/lib/log";

export type CalendarFilter = {
  company?: string; product?: string; service?: string; types?: string[];
  /** An environment slug, or `group:<slug>` standing for that group's members. */
  environment?: string;
  /** Render each lot as a single event instead of one per member service. */
  mergeLots?: boolean;
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

/**
 * A group deleted or emptied under a subscribed feed empties the feed. Logged for the
 * same reason the row cap is: it is a change the subscriber's calendar client shows
 * as "nothing planned", indistinguishable from a genuinely quiet week.
 */
async function groupEnvsFor(filter: CalendarFilter): Promise<string[] | undefined> {
  if (!filter.environment) return undefined;
  const members = await resolveEnvGroupMembers(filter.environment);
  if (members === null) return undefined;
  if (members.length === 0) {
    log.warn("calendar feed scoped to a missing or empty environment group", {
      mod: "calendar", group: filter.environment,
    });
  }
  return members;
}

/** `groupEnvs` set means the environment filter was a group: match its members instead. */
function buildWhere(filter: CalendarFilter, groupEnvs?: string[]): Prisma.EventWhereInput {
  const types = (filter.types?.length ? filter.types : DEFAULT_TYPES).filter((t) => VALID_TYPES.includes(t));
  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    type: { in: (types.length ? types : DEFAULT_TYPES) as EventType[] },
    OR: windowClause(new Date()),
  };
  if (groupEnvs) where.environment = { in: groupEnvs };
  else if (filter.environment) where.environment = filter.environment as Prisma.EventWhereInput["environment"];
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
    const asked = groupEnvs ? undefined : filter.environment;
    const envs = groupEnvs
      ? groupEnvs.filter((e) => filter.publicScope!.envs.includes(e))
      : asked ? (filter.publicScope.envs.includes(asked) ? [asked] : []) : filter.publicScope.envs;
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

type CalRow = Prisma.EventGetPayload<{
  include: { service: { include: { product: { include: { company: true } } } } };
}>;

/** One event, as its own calendar entry. */
function mapEvent(e: CalRow): CalItem {
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
}

/**
 * One VEVENT for a whole lot: the members' span, and the members themselves in the
 * body — the release, not the ten services it happened to touch.
 */
function lotItem(members: CalRow[]): CalItem {
  const first = members[0];
  const lot = first.lot!;
  const starts = members.map((e) => (e.scheduledAt ?? e.occurredAt).getTime());
  const start = new Date(Math.min(...starts));
  // The last member's own half-hour slot, so the lot's block covers all of it.
  const end = new Date(Math.max(...starts) + HALF_HOUR);
  const label = members.every((e) => e.changeType === "HOTFIX") ? "HOTFIX" : "MEP";
  const description = members
    .map((e) => ({ app: `${e.service.product.slug}/${e.service.slug}`, e }))
    // Sorted by app, so the body reads the same whatever order the members deployed in.
    .sort((a, b) => a.app.localeCompare(b.app))
    .map(({ app, e }) => [app, e.version, e.deployStatus ? `— ${e.deployStatus}` : null].filter(Boolean).join(" "))
    .join("\n");
  // Percent-encoded: two lots differing only by punctuation must not collide on one
  // UID, or a calendar client would show them as edits of the same event.
  const uid = `lot-${encodeURIComponent(first.environment)}-${encodeURIComponent(lot)}@releasechronicle`;
  return { uid, start, end, summary: `[${label}] lot ${lot} (${first.environment}) · ${members.length} apps`, description };
}

/**
 * Deployments sharing an (environment, lot) become one item, emitted where the lot's
 * newest member sat so the ordering is unchanged. A lot of one, a deployment with no
 * lot, and every non-deployment fall through untouched: merging them would rename an
 * event without grouping anything.
 */
function mergeLotItems(rows: CalRow[]): CalItem[] {
  const byLot: Record<string, CalRow[]> = {};
  for (const e of rows) if (e.type === "DEPLOYMENT" && e.lot) (byLot[lotKey(e.environment, e.lot)] ??= []).push(e);
  const emitted = new Set<string>();
  const out: CalItem[] = [];
  for (const e of rows) {
    const key = e.type === "DEPLOYMENT" && e.lot ? lotKey(e.environment, e.lot) : null;
    const members = key ? byLot[key] : undefined;
    if (!key || !members || members.length < 2) { out.push(mapEvent(e)); continue; }
    if (emitted.has(key)) continue;
    emitted.add(key);
    out.push(lotItem(members));
  }
  return out;
}

/** Fetch scoped deployments + maintenances and map them to calendar items. */
export async function queryCalendar(filter: CalendarFilter): Promise<CalItem[]> {
  const groupEnvs = await groupEnvsFor(filter);
  // One row over the cap, purely to tell a full feed from a truncated one.
  const fetched = await prisma.event.findMany({
    where: buildWhere(filter, groupEnvs),
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

  return filter.mergeLots ? mergeLotItems(rows) : rows.map(mapEvent);
}
