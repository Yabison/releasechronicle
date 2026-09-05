import type { EventType, IncidentStatus, DeployStatus, ChangeType, Event } from "@prisma/client";
import { DeployStatus as DeployStatusEnum, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { incidentDuration, maintenanceStatus, currentByEnvironment } from "@/lib/derive";
import { canTransition, previousStatus } from "@/lib/deployWorkflow";
import { encodeEventCursor, type EventCursor } from "@/lib/eventCursor";
import { wouldCreateCycle } from "@/lib/causal";
import { RETIRED_CHANGE_TYPES } from "@/lib/schemas/common";

/** Normalized event data produced by the validation layer + service resolution. */
export type EventData = {
  serviceId: string;
  environment: string;
  type: EventType;
  occurredAt: Date;
  externalId?: string;
  metadata?: unknown;
  tags?: string[];
  fields: Record<string, unknown>;
};

export class AnnotationTargetError extends Error {}

type Db = typeof prisma | Prisma.TransactionClient;

function toCreateData(data: EventData): Prisma.EventUncheckedCreateInput {
  return {
    serviceId: data.serviceId,
    environment: data.environment,
    type: data.type,
    occurredAt: data.occurredAt,
    externalId: data.externalId ?? null,
    metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
    tags: data.tags ?? [],
    // `fields` is produced by the per-type zod schemas (src/lib/schemas/event.ts); its
    // keys are known type columns only and never collide with the canonical columns set above.
    ...data.fields,
  };
}

export async function createEvent(data: EventData, db: Db = prisma) {
  // The event and its initial StatusTransition must land together: "the history
  // is never empty" is an invariant, not a best effort. Callers already inside a
  // transaction pass their tx; bare calls get one here.
  if (db === prisma) return prisma.$transaction((tx) => createEventIn(tx, data));
  return createEventIn(db, data);
}

async function createEventIn(db: Db, data: EventData) {
  const ev = await db.event.create({ data: toCreateData(data) });
  if (ev.type === "DEPLOYMENT" && ev.deployStatus) {
    // No requester → no known actor; the UI labels a null actor as the creation itself.
    const requester =
      typeof data.fields.requester === "string" && data.fields.requester.trim()
        ? data.fields.requester.trim()
        : null;
    await db.statusTransition.create({
      data: { eventId: ev.id, fromStatus: null, toStatus: ev.deployStatus, actorName: requester, comment: null },
    });
  }
  return ev;
}

export async function upsertEventByExternalId(externalId: string, data: EventData, db: Db = prisma) {
  const writable = toCreateData({ ...data, externalId });
  const { externalId: _identity, ...updatable } = writable;
  return db.event.upsert({
    where: { source_externalId: { source: "API", externalId } },
    create: writable,
    update: updatable,
  });
}

type ListFilter = {
  environment?: string;
  type?: EventType;
  from?: Date;
  to?: Date;
  /** Extra where fragment merged into the query (e.g. public-mode visibility). */
  scope?: Prisma.EventWhereInput;
};

export function deriveFor(
  e: { type: EventType; windowStart: Date | null; windowEnd: Date | null; startedAt: Date | null; resolvedAt: Date | null },
  now: Date,
) {
  if (e.type === "MAINTENANCE" && e.windowStart && e.windowEnd) {
    return { status: maintenanceStatus(e.windowStart, e.windowEnd, now) };
  }
  if (e.type === "INCIDENT" && e.startedAt) {
    return incidentDuration(e.startedAt, e.resolvedAt, now);
  }
  return {};
}

function serviceEventsWhere(serviceId: string, filter: ListFilter): Prisma.EventWhereInput {
  return {
    serviceId,
    deletedAt: null,
    ...(filter.environment ? { environment: filter.environment } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.from || filter.to
      ? { occurredAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
      : {}),
    ...(filter.scope ?? {}),
  };
}

// `id DESC` tie-break keeps same-instant events in one deterministic order, so a
// cursor can cut between them without skipping or repeating rows.
const FEED_ORDER = [{ occurredAt: "desc" }, { id: "desc" }] satisfies Prisma.EventOrderByWithRelationInput[];

/** Exported so the dashboards can load events in the same shape as a service
 *  feed, and reuse buildServiceTimeline instead of a second row model. */
export const FEED_INCLUDE = {
  rollbacks: true,
  qaValidations: true,
  observations: true,
  statusTransitions: { orderBy: { createdAt: "asc" } },
  comments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.EventInclude;

export async function listServiceEvents(serviceId: string, filter: ListFilter, now: Date = new Date()) {
  const events = await prisma.event.findMany({
    where: serviceEventsWhere(serviceId, filter),
    orderBy: FEED_ORDER,
    include: FEED_INCLUDE,
  });
  return events.map((e) => ({ ...e, derived: deriveFor(e, now) }));
}

/**
 * One page of a service's feed. The cursor is the (occurredAt, id) of the last row
 * of the previous page; the seek predicate resumes strictly after it in FEED_ORDER.
 */
export async function listServiceEventsPage(
  serviceId: string,
  filter: ListFilter,
  page: { limit: number; cursor?: EventCursor },
  now: Date = new Date(),
) {
  const afterCursor: Prisma.EventWhereInput = page.cursor
    ? {
        OR: [
          { occurredAt: { lt: page.cursor.occurredAt } },
          { occurredAt: page.cursor.occurredAt, id: { lt: page.cursor.id } },
        ],
      }
    : {};
  const rows = await prisma.event.findMany({
    where: { AND: [serviceEventsWhere(serviceId, filter), afterCursor] },
    orderBy: FEED_ORDER,
    include: FEED_INCLUDE,
    take: page.limit + 1, // one extra row = "there is a next page", never returned
  });
  const items = rows.slice(0, page.limit);
  const last = items[items.length - 1];
  return {
    items: items.map((e) => ({ ...e, derived: deriveFor(e, now) })),
    nextCursor: rows.length > page.limit && last ? encodeEventCursor(last.occurredAt, last.id) : null,
  };
}

/** How many events fall before `date` — powers the "show older" affordance without loading them. */
export function countServiceEventsBefore(serviceId: string, date: Date): Promise<number> {
  return prisma.event.count({ where: { serviceId, deletedAt: null, occurredAt: { lt: date } } });
}

export async function currentVersions(serviceId: string) {
  const deployments = await prisma.event.findMany({
    where: { serviceId, type: "DEPLOYMENT", deletedAt: null },
    orderBy: { occurredAt: "asc" },
  });
  return currentByEnvironment(deployments);
}

async function assertDeployment(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.type !== "DEPLOYMENT") {
    throw new AnnotationTargetError("annotations apply only to deployments");
  }
  return event;
}

/** Set (or clear, with null) the lot on a deployment. Returns null if not a deployment. */
export async function setEventLot(eventId: string, lot: string | null) {
  if (!(await assertDeployment(eventId))) return null;
  return prisma.event.update({ where: { id: eventId }, data: { lot } });
}

export class PhaseTransitionError extends Error {}

/** A retired change type was offered as a reclassification target. */
export class RetiredChangeTypeError extends Error {}

/**
 * Change a deployment's changeType (e.g. MEP → MEP HOTFIX). Returns null if not a
 * deployment. Leaving a phase (PRE_MEP/POST_MEP → anything else) is always allowed;
 * entering PRE_MEP or POST_MEP is allowed only when the event is ALREADY a phase
 * (i.e. reclassifying PRE_MEP ↔ POST_MEP). An event that is not currently a phase
 * may never become one through this path.
 *
 * Why: creation enforces more than "has a parentId" for phases — see the
 * PRE_MEP/POST_MEP branch in `createEventAction` (src/app/actions/events.ts), which
 * also overwrites the event's environment with the parent's and rejects a date
 * at/after the parent's (PRE_MEP) or at/before it (POST_MEP). That is true for the
 * REST/UI path (`deploymentBodySchema`). It is NOT true for the CI ingest path:
 * `ciDeploymentBodySchema` (src/lib/schemas/ciDeployment.ts) accepts the full
 * changeType enum with no parentId field at all, so a CI-ingested deployment can
 * already be a parentless PRE_MEP/POST_MEP. Restricting entry here to "already a
 * phase" doesn't manufacture the invariants creation enforces for a *fresh* phase
 * (parent environment/date ordering) — it only allows moving between the two
 * phase values, which carries no parent-dependent invariant to begin with.
 */
export async function setEventChangeType(eventId: string, changeType: ChangeType) {
  const event = await assertDeployment(eventId);
  if (!event) return null;
  const enteringPhase = changeType === "PRE_MEP" || changeType === "POST_MEP";
  const alreadyPhase = event.changeType === "PRE_MEP" || event.changeType === "POST_MEP";
  if (enteringPhase && !alreadyPhase) {
    throw new PhaseTransitionError("PRE_MEP/POST_MEP can only be entered by reclassifying an event that is already a phase");
  }
  // Same shape of rule for a retired type: keeping the one an event already has is
  // fine — the drawer offers it precisely in that case — but nothing may acquire
  // it. Creation refuses it outright (see CREATABLE_CHANGE_TYPES); without this,
  // reclassification stayed a way to put a retired value on any deployment.
  if (RETIRED_CHANGE_TYPES.includes(changeType) && event.changeType !== changeType) {
    throw new RetiredChangeTypeError(`${changeType} is retired: it can only be kept on an event that already carries it`);
  }
  return prisma.event.update({ where: { id: eventId }, data: { changeType } });
}

/** Set (or clear, with null) the free-text comment on any event. */
export async function setEventComment(eventId: string, comment: string | null) {
  return prisma.event.update({ where: { id: eventId }, data: { comment } });
}

/** Append a comment to the event's thread. */
export async function addEventComment(eventId: string, author: string | null, body: string) {
  return prisma.eventComment.create({ data: { eventId, author, body } });
}

/** Change an event's occurredAt (date/time). */
export async function setEventOccurredAt(eventId: string, occurredAt: Date) {
  return prisma.event.update({ where: { id: eventId }, data: { occurredAt } });
}

/** Set (or clear, with null) the HO/HNO hour type on a deployment. */
export async function setEventHourType(eventId: string, hourType: string | null) {
  if (!(await assertDeployment(eventId))) return null;
  return prisma.event.update({ where: { id: eventId }, data: { hourType } });
}

/** Replace the tags on any event (trimmed, de-duplicated, blanks dropped). */
export async function setEventTags(eventId: string, tags: string[]) {
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  return prisma.event.update({ where: { id: eventId }, data: { tags: clean } });
}

export async function addRollback(eventId: string, input: { comment: string; link: string | null }) {
  if (!(await assertDeployment(eventId))) return null;
  return prisma.rollback.create({ data: { eventId, comment: input.comment, link: input.link } });
}

/**
 * Create a rollback for a deployment, targeting the version that was live before it
 * (the previous deployment in the same environment). Returns null if `eventId` is not
 * a deployment.
 */
export async function rollbackToPreviousVersion(eventId: string, actorName?: string, comment?: string) {
  const dep = await assertDeployment(eventId);
  if (!dep) return null;
  const previous = await prisma.event.findFirst({
    where: {
      serviceId: dep.serviceId,
      type: "DEPLOYMENT",
      environment: dep.environment,
      occurredAt: { lt: dep.occurredAt },
      deletedAt: null,
    },
    orderBy: { occurredAt: "desc" },
  });
  // Actor and target version are columns; the displayed sentence is composed and
  // translated at render time, so `comment` holds the user's own words only.
  return prisma.rollback.create({
    data: {
      eventId,
      comment: comment?.trim() ? comment.trim() : null,
      previousVersion: previous?.version ?? null,
      actorName: actorName ?? null,
      link: null,
    },
  });
}

export class IncidentTargetError extends Error {}

export class DeployTransitionError extends Error {}

/**
 * Record a forward deploy-status transition: append a StatusTransition row and
 * update Event.deployStatus, atomically. Returns null if the event is not a
 * deployment; throws DeployTransitionError on an illegal move. When the current
 * status is null, the only legal target is PENDING.
 */
export async function transitionDeployStatus(
  eventId: string,
  input: { to: DeployStatus; actorName: string; actorEmail: string | null; comment: string | null },
): Promise<Event | null> {
  const ev = await prisma.event.findUnique({ where: { id: eventId } });
  if (!ev || ev.type !== "DEPLOYMENT") return null;
  const from = ev.deployStatus;
  const legal = from === null ? input.to === DeployStatusEnum.PENDING : canTransition(from, input.to);
  if (!legal) throw new DeployTransitionError(`cannot transition from ${from} to ${input.to}`);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.event.updateMany({
      where: { id: eventId, deployStatus: from },
      data: { deployStatus: input.to },
    });
    if (count === 0) throw new DeployTransitionError("stale transition");
    await tx.statusTransition.create({
      data: {
        eventId,
        fromStatus: from,
        toStatus: input.to,
        actorName: input.actorName,
        actorEmail: input.actorEmail,
        comment: input.comment,
      },
    });
    return tx.event.findUniqueOrThrow({ where: { id: eventId } });
  });
}

/**
 * Step a deployment's status back one notch, recording a backward StatusTransition.
 * Returns null if not a deployment; throws DeployTransitionError when there is no
 * predecessor (status null or PENDING) or a concurrent change lost the race.
 */
export async function undoDeployStatus(
  eventId: string,
  input: { actorName: string; actorEmail: string | null; comment: string | null },
): Promise<Event | null> {
  const ev = await prisma.event.findUnique({ where: { id: eventId } });
  if (!ev || ev.type !== "DEPLOYMENT") return null;
  const from = ev.deployStatus;
  if (from === null) throw new DeployTransitionError("no status to undo");
  const to = previousStatus(from);
  if (to === null) throw new DeployTransitionError("no previous status");
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.event.updateMany({
      where: { id: eventId, deployStatus: from },
      data: { deployStatus: to },
    });
    if (count === 0) throw new DeployTransitionError("stale undo");
    await tx.statusTransition.create({
      data: { eventId, fromStatus: from, toStatus: to, actorName: input.actorName, actorEmail: input.actorEmail, comment: input.comment },
    });
    return tx.event.findUniqueOrThrow({ where: { id: eventId } });
  });
}

/**
 * Update an incident's resolution: set or clear `resolvedAt` (status), and optionally
 * adjust `startedAt`. Returns null if the event does not exist; throws IncidentTargetError
 * if it is not an incident.
 */
export async function updateIncident(
  eventId: string,
  input: { resolvedAt?: Date | null; startedAt?: Date; incidentStatus?: IncidentStatus },
) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.type !== "INCIDENT") {
    throw new IncidentTargetError("only incidents can be edited this way");
  }
  return prisma.event.update({
    where: { id: eventId },
    data: {
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.resolvedAt !== undefined ? { resolvedAt: input.resolvedAt } : {}),
      ...(input.incidentStatus !== undefined ? { incidentStatus: input.incidentStatus } : {}),
    },
  });
}

export async function addQaValidation(eventId: string, input: { validatedBy: string; comment: string | null }) {
  if (!(await assertDeployment(eventId))) return null;
  return prisma.qaValidation.create({ data: { eventId, validatedBy: input.validatedBy, comment: input.comment } });
}

export async function addObservation(eventId: string, input: { who: string; durationMinutes: number; comment: string | null }) {
  if (!(await assertDeployment(eventId))) return null;
  return prisma.observation.create({
    data: { eventId, who: input.who, durationMinutes: input.durationMinutes, comment: input.comment },
  });
}

/**
 * One class for every way a causal link can be refused, discriminated by `reason` so
 * the action layer can map each to its own `err.*` key (mirrors DeployTransitionError's
 * "one class per family" shape, but this family has more than one distinct rule).
 */
export class CausalLinkError extends Error {
  constructor(
    public reason: "selfLink" | "causeNotFound" | "differentProduct" | "cycle",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Set (or clear, with null) the event that caused `eventId`. Returns null if the
 * target event does not exist. Clearing (causeId === null) is always allowed, even
 * when there is nothing to clear. Otherwise throws CausalLinkError when the cause
 * doesn't exist, is the event itself, belongs to a different product, or would
 * close a causal cycle.
 *
 * The existence/ownership/cycle reads and the write all run inside one
 * SERIALIZABLE transaction, re-checked against the transaction client itself
 * (not a separate connection). Without this, two near-simultaneous requests —
 * A's cause set to B, and B's cause set to A — could each pass the cycle check
 * before either commits, producing a real 2-node cycle: "cycles must be
 * impossible" is a hard requirement, not best-effort. Under SERIALIZABLE,
 * Postgres detects that write-skew pattern and aborts one of the two
 * transactions (surfaced here as a CausalLinkError("cycle", …) so the caller
 * gets the same familiar rejection rather than a raw driver error).
 */
export async function setEventCausedBy(eventId: string, causeId: string | null) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const target = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, serviceId: true } });
        if (!target) return null;

        if (causeId === null) {
          return tx.event.update({ where: { id: eventId }, data: { causedById: null } });
        }
        if (causeId === eventId) {
          throw new CausalLinkError("selfLink", "an event cannot be its own cause");
        }

        const cause = await tx.event.findUnique({ where: { id: causeId }, select: { id: true, serviceId: true } });
        if (!cause) {
          throw new CausalLinkError("causeNotFound", "cause event not found");
        }

        const [targetService, causeService] = await Promise.all([
          tx.service.findUnique({ where: { id: target.serviceId }, select: { productId: true } }),
          tx.service.findUnique({ where: { id: cause.serviceId }, select: { productId: true } }),
        ]);
        if (!targetService || !causeService || targetService.productId !== causeService.productId) {
          throw new CausalLinkError("differentProduct", "the cause must belong to the same product");
        }

        if (await wouldCreateCycle(eventId, causeId, tx)) {
          throw new CausalLinkError("cycle", "this link would create a causal cycle");
        }

        return tx.event.update({ where: { id: eventId }, data: { causedById: causeId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    // P2034: "Transaction failed due to a write conflict or a deadlock" — Postgres's
    // serialization-failure signal. It means the concurrency guard just did its job;
    // refuse the link exactly as a detected cycle would, rather than leaking a raw
    // driver error to the caller.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      throw new CausalLinkError("cycle", "concurrent update — refusing to risk a causal cycle, please retry");
    }
    throw e;
  }
}
