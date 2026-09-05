import { prisma } from "@/lib/db";

export type LotMember = {
  eventId: string;
  company: string;
  product: string;
  service: string;
  version: string | null;
  environment: string;
  deployStatus: string | null;
  /** This member's service is the product's master ("main") app. */
  isMaster: boolean;
  /** The deployment has at least one rollback recorded. */
  rolledBack: boolean;
};

/**
 * A lot is scoped to an environment: the same lot name in a different environment is a
 * different lot. This composite key keeps them apart in the members map.
 *
 * The separator is U+001F (unit separator): an environment slug or lot name cannot
 * contain it, so the join is collision-safe -- the same property a NUL byte would have
 * given, but without git classifying this file as binary because of it (which is what
 * a NUL byte used to do here, silently hiding this file's diffs from review).
 */
export function lotKey(environment: string, lot: string): string {
  return `${environment}\u001f${lot}`;
}

export type LotCandidate = {
  eventId: string; product: string; service: string;
  version: string | null; occurredAt: string; lot: string | null;
};

/** How many candidates one listing carries at most. */
export const LOT_CANDIDATE_LIMIT = 300;

/** `truncated` says the company had more recent deployments than the limit could
 *  carry, so the picker can tell the user its list is a window, not the whole set. */
export type LotCandidateList = { items: LotCandidate[]; truncated: boolean };

/**
 * Deployments eligible to be grouped into a lot after the fact: all services of a company
 * in one environment, recent (90d), whose lot is empty or solo (not already in a manual
 * multi-member lot). Newest first, capped at LOT_CANDIDATE_LIMIT.
 */
export async function listLotCandidates(company: string, environment: string): Promise<LotCandidateList> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  // One row over the limit, purely to tell a full page from a truncated one.
  const fetched = await prisma.event.findMany({
    where: {
      type: "DEPLOYMENT", deletedAt: null, environment, occurredAt: { gte: since },
      service: { deletedAt: null, product: { company: { slug: company } } },
    },
    include: { service: { include: { product: true } } },
    orderBy: { occurredAt: "desc" },
    take: LOT_CANDIDATE_LIMIT + 1,
  });
  const truncated = fetched.length > LOT_CANDIDATE_LIMIT;
  const rows = truncated ? fetched.slice(0, LOT_CANDIDATE_LIMIT) : fetched;
  const lotCounts = new Map<string, number>();
  for (const r of rows) if (r.lot) lotCounts.set(r.lot, (lotCounts.get(r.lot) ?? 0) + 1);
  const items = rows
    .filter((r) => !r.lot || (lotCounts.get(r.lot) ?? 0) <= 1)
    .map((r) => ({
      eventId: r.id, product: r.service.product.slug, service: r.service.slug,
      version: r.version, occurredAt: r.occurredAt.toISOString(), lot: r.lot,
    }));
  return { items, truncated };
}

/** Assign an existing set of deployments to a (manual) lot. Returns how many were updated. */
export async function assignLot(eventIds: string[], lot: string): Promise<number> {
  const res = await prisma.event.updateMany({
    where: { id: { in: eventIds }, type: "DEPLOYMENT", deletedAt: null },
    data: { lot, autoLot: false },
  });
  return res.count;
}

/** Members of a lot other than `selfEventId`. */
export function siblings(all: LotMember[], selfEventId: string): LotMember[] {
  return all.filter((m) => m.eventId !== selfEventId);
}

/**
 * For each (environment, lot) key, its deployment members across all products (non-deleted).
 * Grouping is per-environment: members only ever share an environment with the lot.
 */
export async function getLotMembers(lots: string[]): Promise<Record<string, LotMember[]>> {
  const unique = [...new Set(lots.filter(Boolean))];
  if (unique.length === 0) return {};
  const rows = await prisma.event.findMany({
    where: { lot: { in: unique }, type: "DEPLOYMENT", deletedAt: null, service: { deletedAt: null } },
    include: {
      service: { include: { product: { include: { company: true } } } },
      _count: { select: { rollbacks: true } },
    },
    orderBy: { occurredAt: "desc" },
  });
  const map: Record<string, LotMember[]> = {};
  for (const e of rows) {
    if (!e.lot) continue;
    (map[lotKey(e.environment, e.lot)] ??= []).push({
      eventId: e.id,
      company: e.service.product.company.slug,
      product: e.service.product.slug,
      service: e.service.slug,
      version: e.version,
      environment: e.environment,
      deployStatus: e.deployStatus,
      isMaster: e.service.isMaster,
      rolledBack: e._count.rollbacks > 0,
    });
  }
  return map;
}

/**
 * When the lot's master ("main") app has been rolled back but some non-master
 * members have NOT, returns those members' "product/service" labels. Empty array
 * means no inconsistency (master not rolled back, or every member rolled back).
 */
export function lotRollbackGap(members: LotMember[]): string[] {
  const master = members.find((m) => m.isMaster);
  if (!master || !master.rolledBack) return [];
  return members.filter((m) => !m.isMaster && !m.rolledBack).map((m) => `${m.product}/${m.service}`);
}

/** lotKey → gap labels, for every lot whose master rollback is not mirrored by its members. */
export function lotRollbackWarnings(byKey: Record<string, LotMember[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, members] of Object.entries(byKey)) {
    const gap = lotRollbackGap(members);
    if (gap.length > 0) out[key] = gap;
  }
  return out;
}
