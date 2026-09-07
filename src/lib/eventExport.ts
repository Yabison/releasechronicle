import { prisma } from "@/lib/db";
import type { EventType, Prisma } from "@prisma/client";
import type { ExportEvent } from "@/lib/excel";

export type ExportFilter = {
  environment?: string;
  type?: string;
  serviceId?: string;
  from?: string;
  to?: string;
};

/** Fetch non-deleted events matching the UI filter, with hierarchy slugs resolved. */
export async function queryEventsForExport(filter: ExportFilter): Promise<ExportEvent[]> {
  const where: Prisma.EventWhereInput = { deletedAt: null, service: { deletedAt: null } };
  if (filter.serviceId) where.serviceId = filter.serviceId;
  if (filter.environment) where.environment = filter.environment;
  if (filter.type) where.type = filter.type as EventType;
  if (filter.from || filter.to) {
    where.occurredAt = {};
    if (filter.from) (where.occurredAt as Prisma.DateTimeFilter).gte = new Date(filter.from);
    if (filter.to) (where.occurredAt as Prisma.DateTimeFilter).lte = new Date(filter.to);
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    include: { service: { include: { product: { include: { company: true } } } } },
  });

  return events.map((e) => ({
    type: e.type,
    environment: e.environment,
    externalId: e.externalId,
    occurredAt: e.occurredAt,
    tags: e.tags,
    version: e.version,
    lot: e.lot,
    requester: e.requester,
    changeType: e.changeType,
    deployStatus: e.deployStatus,
    externalLink: e.externalLink,
    incidentType: e.incidentType,
    incidentStatus: e.incidentStatus,
    startedAt: e.startedAt,
    resolvedAt: e.resolvedAt,
    comment: e.comment,
    windowStart: e.windowStart,
    windowEnd: e.windowEnd,
    service: {
      company: e.service.product.company.slug,
      product: e.service.product.slug,
      service: e.service.slug,
    },
  }));
}
