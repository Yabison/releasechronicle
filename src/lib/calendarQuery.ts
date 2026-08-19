import type { Prisma, EventType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CalItem } from "@/lib/ics";

export type CalendarFilter = {
  company?: string; product?: string; service?: string; environment?: string; types?: string[];
  /** Anonymous caller: restrict to public hierarchies, environments and event types. */
  publicScope?: { envs: string[]; types: string[] };
};

const HALF_HOUR = 30 * 60_000;
const ONE_HOUR = 60 * 60_000;

const DEFAULT_TYPES = ["DEPLOYMENT", "MAINTENANCE"];
const VALID_TYPES = ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"];

function buildWhere(filter: CalendarFilter): Prisma.EventWhereInput {
  const types = (filter.types?.length ? filter.types : DEFAULT_TYPES).filter((t) => VALID_TYPES.includes(t));
  const where: Prisma.EventWhereInput = { deletedAt: null, type: { in: (types.length ? types : DEFAULT_TYPES) as EventType[] } };
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
  const rows = await prisma.event.findMany({
    where: buildWhere(filter),
    include: { service: { include: { product: { include: { company: true } } } } },
    orderBy: { occurredAt: "desc" },
    take: 1000,
  });

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
