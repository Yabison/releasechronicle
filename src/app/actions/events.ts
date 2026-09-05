"use server";

import { revalidatePath } from "next/cache";
import type { EventType, ChangeType } from "@prisma/client";
import { DeployStatus, ChangeType as ChangeTypeEnum } from "@prisma/client";
import {
  deploymentBodySchema,
  incidentBodySchema,
  maintenanceBodySchema,
  type EventBodyShape,
} from "@/lib/schemas/event";
import { zodErrorMessage } from "@/lib/schemas/parse";
import { persistValidated } from "@/lib/ingest";
import { getActiveEnvSlugs } from "@/lib/environment";
import { emitHooks } from "@/lib/hooks/dispatch";
import "@/lib/hooks";
import {
  rollbackToPreviousVersion,
  updateIncident,
  transitionDeployStatus,
  undoDeployStatus,
  setEventLot,
  setEventChangeType,
  setEventHourType,
  setEventComment,
  addEventComment,
  setEventTags,
  setEventOccurredAt,
  createEvent,
  setEventCausedBy,
  type EventData,
  AnnotationTargetError,
  IncidentTargetError,
  DeployTransitionError,
  CausalLinkError,
  PhaseTransitionError,
  RetiredChangeTypeError,
} from "@/lib/events";
import { getServicesBySlugs, serviceRefKey } from "@/lib/hierarchy";
import { prisma } from "@/lib/db";
import { commentRequired, roleGroup } from "@/lib/deployWorkflow";
import { getSession, hasRole } from "@/lib/auth/session";
import { fail, type ActionFailure } from "@/lib/actionError";

export type CreateEventInput = Record<string, unknown> & {
  type: EventType;
  company: string;
  product: string;
  service: string;
  /** Route path to revalidate after a successful create. */
  path: string;
};

export type CreateEventResult = { ok: true } | ActionFailure;

/**
 * Server-side manual event trigger used by the UI. Reuses the same validators
 * and persistence path as the REST API. A server action is a plain POST endpoint
 * reachable by anyone who knows its id, so it gates on the session itself — the
 * write token guards the REST twin, this guards the UI twin.
 */
export async function createEventAction(input: CreateEventInput): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  const { type, path, ...body } = input;

  const schema =
    type === "DEPLOYMENT" ? deploymentBodySchema :
    type === "INCIDENT" ? incidentBodySchema :
    type === "MAINTENANCE" ? maintenanceBodySchema : null;
  if (!schema) return fail("err.unknownEventType");

  const v = schema.safeParse(body);
  if (!v.success) return { ok: false, error: zodErrorMessage(v.error) };

  // PRE/POST MEP: inherit the parent's environment and keep the date before/after it.
  if (type === "DEPLOYMENT") {
    const f = (v.data.fields ?? {}) as { changeType?: string; parentId?: string | null };
    if ((f.changeType === "PRE_MEP" || f.changeType === "POST_MEP") && f.parentId) {
      const parent = await prisma.event.findUnique({ where: { id: f.parentId }, select: { environment: true, occurredAt: true } });
      if (!parent) return fail("err.parentNotFound");
      (v.data as { environment: string }).environment = parent.environment;
      const when = v.data.occurredAt;
      if (f.changeType === "PRE_MEP" && when >= parent.occurredAt) return fail("err.preBeforeParent");
      if (f.changeType === "POST_MEP" && when <= parent.occurredAt) return fail("err.postAfterParent");
    }
  }

  if (!(await getActiveEnvSlugs()).includes(v.data.environment)) {
    return fail("err.unknownEnv");
  }

  const res = await persistValidated(type, v.data as EventBodyShape<Record<string, unknown>>);
  if (res.status >= 400) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ? { ok: false, error: data.error } : fail("err.requestFailed", { status: res.status });
  }

  revalidatePath(path);
  return { ok: true };
}

/**
 * Create a rollback annotation on a deployment, targeting the previous version
 * in that environment. Server-side trusted (no write token), same as createEventAction.
 */
export async function createRollbackAction(input: {
  eventId: string;
  path: string;
  /** @deprecated ignored; the actor is taken from the session. */
  actorName?: string;
  comment?: string;
}): Promise<CreateEventResult> {
  const session = await getSession();
  if (!session) return fail("err.loginRequired");
  if (!hasRole(session, "admin") && !hasRole(session, "devops")) {
    return fail("err.roleRequired", { role: "devops" });
  }
  const actorName = session.name;
  try {
    const rb = await rollbackToPreviousVersion(input.eventId, actorName, input.comment);
    if (!rb) return fail("err.deploymentNotFound");
  } catch (e) {
    if (e instanceof AnnotationTargetError) {
      return fail("err.rollbackDeployOnly");
    }
    throw e;
  }
  await emitHooks(input.eventId, "deploy.rolled_back", actorName);
  revalidatePath(input.path);
  return { ok: true };
}

/**
 * Update an incident's end time / status from the UI. `resolvedAt` is an ISO string
 * (resolved) or null (reopened); `startedAt` optionally adjusts the start time.
 */
const INCIDENT_STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
type IncidentStatusValue = (typeof INCIDENT_STATUSES)[number];

export async function updateIncidentAction(input: {
  eventId: string;
  path: string;
  status: IncidentStatusValue;
  /** End time, ISO. Used only when status is RESOLVED; defaults to now if omitted. */
  resolvedAt?: string;
  startedAt?: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  if (!INCIDENT_STATUSES.includes(input.status)) {
    return fail("err.badIncidentStatus");
  }
  // RESOLVED carries an end time (given or now); any other status clears it.
  let resolvedAt: Date | null = null;
  if (input.status === "RESOLVED") {
    resolvedAt = input.resolvedAt ? new Date(input.resolvedAt) : new Date();
    if (Number.isNaN(resolvedAt.getTime())) return fail("err.badEndTime");
  }
  let startedAt: Date | undefined;
  if (input.startedAt !== undefined) {
    startedAt = new Date(input.startedAt);
    if (Number.isNaN(startedAt.getTime())) return fail("err.badStartTime");
  }
  if (resolvedAt !== null && startedAt && resolvedAt < startedAt) {
    return fail("err.endBeforeStart");
  }
  try {
    const updated = await updateIncident(input.eventId, {
      resolvedAt,
      startedAt,
      incidentStatus: input.status,
    });
    if (!updated) return fail("err.incidentNotFound");
  } catch (e) {
    if (e instanceof IncidentTargetError) return fail("err.notAnIncident");
    throw e;
  }
  revalidatePath(input.path);
  return { ok: true };
}

const DEPLOY_STATUS_VALUES = Object.values(DeployStatus) as string[];

/**
 * Advance a deployment's status via the devops/qa workflow, recording actor and
 * optional comment as a StatusTransition. VALIDATE requires a comment.
 */
export async function transitionDeployStatusAction(input: {
  eventId: string;
  to: string;
  /** @deprecated ignored; the actor is taken from the session. */
  actorName?: string;
  /** @deprecated ignored; the actor is taken from the session. */
  actorEmail?: string;
  comment?: string;
  path: string;
}): Promise<CreateEventResult> {
  if (!DEPLOY_STATUS_VALUES.includes(input.to)) {
    return fail("err.badDeployStatus");
  }
  const to = input.to as DeployStatus;
  const session = await getSession();
  if (!session) return fail("err.loginRequired");
  const required = roleGroup(to);
  if (!hasRole(session, "admin") && !hasRole(session, required)) {
    return fail("err.roleRequired", { role: required });
  }
  const actorName = session.name;
  const actorEmail = session.email ?? null;
  const comment = input.comment?.trim() ? input.comment.trim() : null;
  if (commentRequired(to) && !comment) {
    return fail("err.commentRequiredValidate");
  }
  try {
    const updated = await transitionDeployStatus(input.eventId, { to, actorName, actorEmail, comment });
    if (!updated) return fail("err.deploymentNotFound");
  } catch (e) {
    if (e instanceof DeployTransitionError) {
      return fail("err.transitionNotAllowed");
    }
    throw e;
  }
  await emitHooks(input.eventId, "deploy.status_changed", actorName);
  revalidatePath(input.path);
  return { ok: true };
}

/**
 * Revert a deployment's status to its previous step, recording actor and a
 * required comment as a StatusTransition.
 */
export async function undoDeployStatusAction(input: {
  eventId: string;
  /** @deprecated ignored; the actor is taken from the session. */
  actorName?: string;
  /** @deprecated ignored; the actor is taken from the session. */
  actorEmail?: string;
  comment: string;
  path: string;
}): Promise<CreateEventResult> {
  const session = await getSession();
  if (!session) return fail("err.loginRequired");
  if (!hasRole(session, "admin") && !hasRole(session, "devops")) {
    return fail("err.roleRequired", { role: "devops" });
  }
  const actorName = session.name;
  const actorEmail = session.email ?? null;
  const comment = input.comment?.trim() ? input.comment.trim() : "";
  if (comment === "") return fail("err.commentRequiredUndo");
  try {
    const updated = await undoDeployStatus(input.eventId, { actorName, actorEmail, comment });
    if (!updated) return fail("err.deploymentNotFound");
  } catch (e) {
    if (e instanceof DeployTransitionError) return fail("err.noTransitionToUndo");
    throw e;
  }
  await emitHooks(input.eventId, "deploy.status_undone", actorName);
  revalidatePath(input.path);
  return { ok: true };
}

/** Set (or clear, when blank) the `lot` label on a deployment. */
export async function updateEventLotAction(input: {
  eventId: string;
  lot: string;
  path: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  const lot = input.lot.trim() ? input.lot.trim() : null;
  try {
    const updated = await setEventLot(input.eventId, lot);
    if (!updated) return fail("err.deploymentNotFound");
  } catch (e) {
    if (e instanceof AnnotationTargetError) {
      return fail("err.lotDeployOnly");
    }
    throw e;
  }
  revalidatePath(input.path);
  return { ok: true };
}

// The allowlist is just every ChangeType value — no hand-maintained copy to drift.
// It stays the full enum on purpose: this only rejects a value that is not a
// ChangeType at all. Which values may be *entered* is policy, and policy lives in
// `setEventChangeType` — phases can only be reached from a phase, and a retired
// type can only be kept on an event that already carries it. Narrowing this list
// to the creatable set would break reclassifying a retired event, which the
// drawer offers.
const CHANGE_TYPES: ChangeType[] = Object.values(ChangeTypeEnum);

/**
 * Change a deployment's type after the fact (e.g. a MEP reclassified as MEP HOTFIX).
 * Entering PRE_MEP/POST_MEP on an event that isn't already a phase is rejected by
 * the domain layer — see `setEventChangeType` — since only PRE_MEP ↔ POST_MEP
 * reclassification is allowed; a non-phase event can never become one here.
 */
export async function updateEventChangeTypeAction(input: {
  eventId: string;
  changeType: string;
  path: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  if (!(CHANGE_TYPES as string[]).includes(input.changeType)) {
    return fail("err.badChangeType");
  }
  try {
    const updated = await setEventChangeType(input.eventId, input.changeType as ChangeType);
    if (!updated) return fail("err.deploymentNotFound");
  } catch (e) {
    if (e instanceof AnnotationTargetError) {
      return fail("err.changeTypeDeployOnly");
    }
    if (e instanceof PhaseTransitionError) {
      return fail("err.phaseTransitionNotAllowed");
    }
    if (e instanceof RetiredChangeTypeError) {
      return fail("err.retiredChangeType");
    }
    throw e;
  }
  revalidatePath(input.path);
  return { ok: true };
}

/** Change an event's date (occurredAt). For PRE/POST MEP, keeps it before/after the parent. */
export async function updateEventDateAction(input: {
  eventId: string;
  occurredAt: string;
  path: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  const d = new Date(input.occurredAt);
  if (isNaN(d.getTime())) return fail("err.badDate");
  const ev = await prisma.event.findUnique({ where: { id: input.eventId }, select: { changeType: true, parentId: true } });
  if (!ev) return fail("err.eventNotFound");
  if ((ev.changeType === "PRE_MEP" || ev.changeType === "POST_MEP") && ev.parentId) {
    const parent = await prisma.event.findUnique({ where: { id: ev.parentId }, select: { occurredAt: true } });
    if (parent) {
      if (ev.changeType === "PRE_MEP" && d >= parent.occurredAt) return fail("err.preBeforeParent");
      if (ev.changeType === "POST_MEP" && d <= parent.occurredAt) return fail("err.postAfterParent");
    }
  }
  await setEventOccurredAt(input.eventId, d);
  revalidatePath(input.path);
  return { ok: true };
}

/** Set the HO/HNO hour type on a deployment (empty string clears it). */
export async function updateEventHourTypeAction(input: {
  eventId: string;
  hourType: string;
  path: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  const ht = input.hourType === "HO" || input.hourType === "HNO" ? input.hourType : null;
  if (input.hourType && ht === null) return fail("err.badHourType");
  try {
    const updated = await setEventHourType(input.eventId, ht);
    if (!updated) return fail("err.deploymentNotFound");
  } catch (e) {
    if (e instanceof AnnotationTargetError) {
      return fail("err.hourTypeDeployOnly");
    }
    throw e;
  }
  revalidatePath(input.path);
  return { ok: true };
}

/** Replace an event's tags. */
export async function updateEventTagsAction(input: {
  eventId: string;
  tags: string[];
  path: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  if (!Array.isArray(input.tags) || !input.tags.every((t) => typeof t === "string")) {
    return fail("err.badTags");
  }
  try {
    await setEventTags(input.eventId, input.tags);
  } catch {
    return fail("err.eventNotFound");
  }
  revalidatePath(input.path);
  return { ok: true };
}

/** Add / edit / clear the free-text comment on an event. */
export async function updateEventCommentAction(input: {
  eventId: string;
  comment: string;
  path: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  const comment = input.comment.trim() ? input.comment.trim() : null;
  try {
    await setEventComment(input.eventId, comment);
  } catch {
    return fail("err.eventNotFound");
  }
  revalidatePath(input.path);
  return { ok: true };
}

/** Append a comment to an event's thread; the author is the current session user. */
export async function addEventCommentAction(input: {
  eventId: string;
  body: string;
  path: string;
}): Promise<CreateEventResult> {
  const session = await getSession();
  if (!session) return fail("err.loginRequired");
  const body = input.body.trim();
  if (!body) return fail("err.emptyComment");
  const author = session.name;
  try {
    await addEventComment(input.eventId, author, body);
  } catch {
    return fail("err.eventNotFound");
  }
  revalidatePath(input.path);
  return { ok: true };
}

const CAUSAL_ERROR_KEYS: Record<CausalLinkError["reason"], string> = {
  selfLink: "err.causeSelfLink",
  causeNotFound: "err.causeNotFound",
  differentProduct: "err.causeDifferentProduct",
  cycle: "err.causeCycle",
};

/** Set (or clear, with null causeId) the event that caused this one. */
export async function updateEventCausedByAction(input: {
  eventId: string;
  causeId: string | null;
  path: string;
}): Promise<CreateEventResult> {
  if (!(await getSession())) return fail("err.loginRequired");
  try {
    const updated = await setEventCausedBy(input.eventId, input.causeId);
    if (!updated) return fail("err.eventNotFound");
  } catch (e) {
    if (e instanceof CausalLinkError) return fail(CAUSAL_ERROR_KEYS[e.reason]);
    throw e;
  }
  revalidatePath(input.path);
  return { ok: true };
}

/** Group already-existing deployments into a (manual) lot. */
export async function createLotFromExistingAction(input: {
  eventIds: string[];
  lot: string;
  path: string;
}): Promise<{ ok: true; count: number } | ActionFailure> {
  if (!(await getSession())) return fail("err.loginRequired");
  const lot = input.lot.trim();
  if (!lot) return fail("err.lotKeyRequired");
  if (!Array.isArray(input.eventIds) || input.eventIds.length === 0) {
    return fail("err.atLeastOneMep");
  }
  const { assignLot } = await import("@/lib/deployLot");
  const count = await assignLot(input.eventIds, lot);
  revalidatePath(input.path);
  return { ok: true, count };
}

export type LotItem = { company: string; product: string; service: string; version: string; externalLink?: string };
export type CreateLotInput = {
  path: string;
  common: { environment: string; requester: string; changeType: string; deployStatus: string; lot: string; occurredAt?: string; scheduledAt?: string };
  items: LotItem[];
};

/**
 * Create one DEPLOYMENT event per item, all sharing the same `lot` label. Validates
 * and resolves every row before opening the transaction (all-or-nothing).
 */
export async function createLotAction(input: CreateLotInput): Promise<{ ok: true; created: number } | ActionFailure> {
  if (!(await getSession())) return fail("err.loginRequired");
  const { common, items, path } = input;
  if (!items || items.length === 0) return fail("err.atLeastOneProduct");

  const active = new Set(await getActiveEnvSlugs());
  if (!active.has(common.environment)) return fail("err.unknownEnv");

  // Resolved up front, in one query: the loop below would otherwise resolve a
  // service per item. Order of failures is unchanged — each item is still zod-
  // checked before its service is looked up, and the first bad item still wins.
  const services = await getServicesBySlugs(items);

  const validated: { data: EventData }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const body = {
      company: it.company, product: it.product, service: it.service,
      environment: common.environment, version: it.version, requester: common.requester,
      changeType: common.changeType, deployStatus: common.deployStatus, lot: common.lot,
      ...(it.externalLink ? { externalLink: it.externalLink } : {}),
      ...(common.occurredAt ? { occurredAt: common.occurredAt } : {}),
      ...(common.scheduledAt ? { scheduledAt: common.scheduledAt } : {}),
    };
    const v = deploymentBodySchema.safeParse(body);
    if (!v.success) return fail("err.lotRow", { n: i + 1, reason: zodErrorMessage(v.error) });
    const svc = services.get(serviceRefKey(it));
    if (!svc) return fail("err.lotRow", { n: i + 1, reason: "err.serviceNotFound" });
    validated.push({
      data: {
        serviceId: svc.id, environment: v.data.environment, type: "DEPLOYMENT",
        occurredAt: v.data.occurredAt, externalId: v.data.externalId,
        tags: v.data.tags ?? [], fields: v.data.fields,
      } as EventData,
    });
  }

  const ids = await prisma.$transaction(async (tx) => {
    const out: string[] = [];
    for (const { data } of validated) {
      const ev = await createEvent(data, tx);
      out.push(ev.id);
    }
    return out;
  });

  for (const id of ids) await emitHooks(id, "deploy.created");
  revalidatePath(path);
  return { ok: true, created: ids.length };
}

