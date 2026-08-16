import type { EventType, IncidentStatus, DeployStatus, ChangeType, Event, Prisma } from "@prisma/client";
import { DeployStatus as DeployStatusEnum } from "@prisma/client";
import { prisma } from "@/lib/db";
import { incidentDuration, maintenanceStatus, currentByEnvironment } from "@/lib/derive";
import { canTransition, previousStatus } from "@/lib/deployWorkflow";

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
    // `fields` is produced by the per-type validators (eventValidation.ts); its keys are
    // known type columns only and never collide with the canonical columns set above.
    ...data.fields,
  };
}

export async function createEvent(data: EventData, db: Db = prisma) {
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

type ListFilter = { environment?: string; type?: EventType; from?: Date; to?: Date };

function deriveFor(
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

export async function listServiceEvents(serviceId: string, filter: ListFilter, now: Date = new Date()) {
  const events = await prisma.event.findMany({
    where: {
      serviceId,
      deletedAt: null,
      ...(filter.environment ? { environment: filter.environment } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.from || filter.to
        ? { occurredAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    include: { rollbacks: true, qaValidations: true, observations: true, statusTransitions: { orderBy: { createdAt: "asc" } }, comments: { orderBy: { createdAt: "asc" } } },
  });
  return events.map((e) => ({ ...e, derived: deriveFor(e, now) }));
}

/** How many events fall before `date` — powers the "show older" affordance without loading them. */
export function countServiceEventsBefore(serviceId: string, date: Date): Promise<number> {
  return prisma.event.count({ where: { serviceId, deletedAt: null, occurredAt: { lt: date } } });
}

export async function listProductEvents(
  productId: string,
  filter: ListFilter,
  now: Date = new Date(),
) {
  const events = await prisma.event.findMany({
    where: {
      service: { productId },
      deletedAt: null,
      ...(filter.environment ? { environment: filter.environment } : {}),
      ...(filter.type ? { type: filter.type } : {}),
    },
    orderBy: { occurredAt: "desc" },
    include: { rollbacks: true, qaValidations: true, observations: true, statusTransitions: { orderBy: { createdAt: "asc" } }, comments: { orderBy: { createdAt: "asc" } } },
  });
  return events.map((e) => ({ ...e, derived: deriveFor(e, now) }));
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

/** Change a deployment's changeType (e.g. MEP → MEP HOTFIX). Returns null if not a deployment. */
export async function setEventChangeType(eventId: string, changeType: ChangeType) {
  if (!(await assertDeployment(eventId))) return null;
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
