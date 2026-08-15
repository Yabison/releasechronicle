import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DoraDeploy, DoraIncident } from "@/lib/dora";

export type DoraFilter = {
  company?: string; product?: string; service?: string; environment?: string; days: number;
  /** Anonymous caller: restrict to public hierarchies and public environments. */
  publicScope?: { envs: string[] };
};

/** Build the hierarchy/env/window scoping for events. */
function buildWhere(filter: DoraFilter, from: Date): Prisma.EventWhereInput {
  const where: Prisma.EventWhereInput = { deletedAt: null, occurredAt: { gte: from } };
  if (filter.environment) where.environment = filter.environment as Prisma.EventWhereInput["environment"];
  const product: Prisma.ProductWhereInput = {};
  if (filter.company) product.company = { slug: filter.company };
  if (filter.product) product.slug = filter.product;
  const service: Prisma.ServiceWhereInput = {};
  if (filter.service) service.slug = filter.service;
  if (filter.publicScope) {
    // Narrows the caller's filter, never widens it: asking explicitly for a private
    // environment still comes back empty rather than falling back to all of them.
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
  if (Object.keys(service).length) where.service = service;
  return where;
}

export async function queryDoraData(filter: DoraFilter): Promise<{ deploys: DoraDeploy[]; incidents: DoraIncident[]; windowDays: number }> {
  const days = Math.max(filter.days, 1);
  const from = new Date(Date.now() - days * 86_400_000);
  const base = buildWhere(filter, from);

  const deployRows = await prisma.event.findMany({
    where: { ...base, type: "DEPLOYMENT" },
    select: {
      occurredAt: true,
      _count: { select: { rollbacks: true } },
      statusTransitions: { where: { toStatus: "DEPLOYED" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
    },
  });
  const deploys: DoraDeploy[] = deployRows.map((e) => ({
    occurredAt: e.occurredAt.toISOString(),
    deployedAt: e.statusTransitions[0]?.createdAt.toISOString() ?? null,
    rolledBack: e._count.rollbacks > 0,
  }));

  const incidentRows = await prisma.event.findMany({
    where: { ...base, type: "INCIDENT" },
    select: { startedAt: true, resolvedAt: true },
  });
  const incidents: DoraIncident[] = incidentRows.map((e) => ({
    startedAt: (e.startedAt ?? new Date(0)).toISOString(),
    resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
  }));

  return { deploys, incidents, windowDays: days };
}
