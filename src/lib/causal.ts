import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** How far back (relative to the target event's own occurredAt) a candidate cause may lie. */
const DEFAULT_WINDOW_DAYS = 30;
/** A page's worth of options for a picker; the list is meant to be skimmed, not paged. */
const DEFAULT_LIMIT = 20;
/** Depth cap for the causedBy-chain walk: bounds an already-corrupted (cyclic) chain. */
const MAX_CHAIN_DEPTH = 20;

type Db = typeof prisma | Prisma.TransactionClient;

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
export async function wouldCreateCycle(eventId: string, causeId: string, db: Db = prisma): Promise<boolean> {
  let currentId: string | null = causeId;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
    if (currentId === eventId) return true;
    const current: { causedById: string | null } | null = await db.event.findUnique({
      where: { id: currentId },
      select: { causedById: true },
    });
    if (!current || !current.causedById) return false;
    currentId = current.causedById;
  }
  // Depth cap reached without resolving: refuse rather than risk a real cycle.
  return true;
}

/** A resolved causal picture for one event: its cause (if any) and what it led to. */
export type CausalSummary = { causedBy?: CausalCandidate; led: CausalCandidate[] };

const CAUSAL_SELECT = {
  id: true,
  type: true,
  environment: true,
  version: true,
  occurredAt: true,
  service: { select: { slug: true } },
} satisfies Prisma.EventSelect;

type CausalRow = { id: string; type: string; environment: string; version: string | null; occurredAt: Date; service: { slug: string } };

function toCandidate(r: CausalRow): CausalCandidate {
  return { id: r.id, type: r.type, environment: r.environment, version: r.version, occurredAt: r.occurredAt, serviceSlug: r.service.slug };
}

/**
 * Batched, product-wide causal summaries for a set of displayed events. Resolves
 * against the database — not the caller's per-service event list — because a
 * cause is deliberately allowed to live on a sibling service of the same product
 * (see `listCausalCandidates`); a client-side array scoped to one service can
 * never see it. Exactly two queries regardless of how many events are passed in,
 * so rendering a feed of drawers costs nothing per-drawer. Soft-deleted rows are
 * excluded on both sides. `extraWhere` lets callers additionally restrict which
 * rows may be resolved/exposed (e.g. public/anonymous visibility) — a row excluded
 * by it is omitted from the result exactly like a soft-deleted one, never leaked
 * as a raw id.
 */
export async function getCausalSummaries(
  targets: { id: string; causedById: string | null }[],
  extraWhere?: Prisma.EventWhereInput,
): Promise<Map<string, CausalSummary>> {
  const eventIds = targets.map((t) => t.id);
  const causeIds = [...new Set(targets.map((t) => t.causedById).filter((id): id is string => !!id))];

  const [causeRows, ledRows] = await Promise.all([
    causeIds.length
      ? prisma.event.findMany({ where: { id: { in: causeIds }, deletedAt: null, ...(extraWhere ?? {}) }, select: CAUSAL_SELECT })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.event.findMany({
          where: { causedById: { in: eventIds }, deletedAt: null, ...(extraWhere ?? {}) },
          select: { ...CAUSAL_SELECT, causedById: true },
        })
      : Promise.resolve([]),
  ]);

  const causeById = new Map(causeRows.map((r) => [r.id, toCandidate(r)]));
  const ledByCauseId = new Map<string, CausalCandidate[]>();
  for (const r of ledRows) {
    const key = r.causedById as string;
    const list = ledByCauseId.get(key);
    if (list) list.push(toCandidate(r));
    else ledByCauseId.set(key, [toCandidate(r)]);
  }

  const result = new Map<string, CausalSummary>();
  for (const t of targets) {
    result.set(t.id, {
      causedBy: t.causedById ? causeById.get(t.causedById) : undefined,
      led: ledByCauseId.get(t.id) ?? [],
    });
  }
  return result;
}
