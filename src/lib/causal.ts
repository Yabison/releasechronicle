import { prisma } from "@/lib/db";

/** How far back (relative to the target event's own occurredAt) a candidate cause may lie. */
const DEFAULT_WINDOW_DAYS = 30;
/** A page's worth of options for a picker; the list is meant to be skimmed, not paged. */
const DEFAULT_LIMIT = 20;
/** Depth cap for the causedBy-chain walk: bounds an already-corrupted (cyclic) chain. */
const MAX_CHAIN_DEPTH = 20;

export type CausalCandidate = {
  id: string;
  type: string;
  environment: string;
  version: string | null;
  occurredAt: Date;
  serviceSlug: string;
};

/**
 * Events that may legitimately be picked as the cause of `eventId`: same product
 * (an incident on one service can be caused by a deployment on a sibling service),
 * within a recent window *before* the target's own occurredAt (a cause cannot
 * postdate its effect), newest first. Returns [] when the event itself doesn't exist.
 */
export async function listCausalCandidates(
  eventId: string,
  opts?: { days?: number; limit?: number },
): Promise<CausalCandidate[]> {
  const days = opts?.days ?? DEFAULT_WINDOW_DAYS;
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  const target = await prisma.event.findUnique({
    where: { id: eventId },
    select: { occurredAt: true, service: { select: { productId: true } } },
  });
  if (!target) return [];

  const windowStart = new Date(target.occurredAt.getTime() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.event.findMany({
    where: {
      id: { not: eventId },
      deletedAt: null,
      occurredAt: { gte: windowStart, lte: target.occurredAt },
      service: { productId: target.service.productId },
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      environment: true,
      version: true,
      occurredAt: true,
      service: { select: { slug: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    environment: r.environment,
    version: r.version,
    occurredAt: r.occurredAt,
    serviceSlug: r.service.slug,
  }));
}

/**
 * Would linking `eventId`'s cause to `causeId` create a cycle? Walks UP the
 * causedBy chain starting at `causeId`; if `eventId` is reached, it's a cycle.
 * The walk is capped at MAX_CHAIN_DEPTH hops so already-corrupted data (a cycle
 * that predates this check) cannot loop forever -- hitting the cap is treated
 * as a cycle, refusing the new link rather than risking one.
 */
export async function wouldCreateCycle(eventId: string, causeId: string): Promise<boolean> {
  let currentId: string | null = causeId;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
    if (currentId === eventId) return true;
    const current: { causedById: string | null } | null = await prisma.event.findUnique({
      where: { id: currentId },
      select: { causedById: true },
    });
    if (!current || !current.causedById) return false;
    currentId = current.causedById;
  }
  // Depth cap reached without resolving: refuse rather than risk a real cycle.
  return true;
}
