import { getServiceBySlug } from "@/lib/hierarchy";
import { createEvent, upsertEventByExternalId, type EventData } from "@/lib/events";
import { isUniqueViolation } from "@/lib/http";
import { emitHooks } from "@/lib/hooks/dispatch";
import "@/lib/hooks";
import type { EventType } from "@prisma/client";
import type { ValidatedEvent } from "@/lib/eventValidation";

export class ServiceNotFoundError extends Error {
  constructor() {
    super("service not found");
    this.name = "ServiceNotFoundError";
  }
}

export class EnvNotActiveError extends Error {
  constructor(env: string) {
    super(`unknown environment: ${env}`);
    this.name = "EnvNotActiveError";
  }
}

/**
 * Resolve the service and persist a validated event. Returns the persisted event.
 * Throws ServiceNotFoundError when the service does not resolve. Behavior mirrors the
 * REST path: with an externalId path it upserts; otherwise it creates (a duplicate
 * externalId then surfaces as a unique-constraint error, same as before).
 */
export async function persistValidatedEvent<F extends Record<string, unknown>>(
  type: EventType,
  v: ValidatedEvent<F>,
  externalIdFromPath?: string,
) {
  const service = await getServiceBySlug(v.service.company, v.service.product, v.service.service);
  if (!service) throw new ServiceNotFoundError();

  const { getActiveEnvSlugs } = await import("@/lib/environment");
  if (!(await getActiveEnvSlugs()).includes(v.environment)) throw new EnvNotActiveError(v.environment);

  const data: EventData = {
    serviceId: service.id,
    environment: v.environment,
    type,
    occurredAt: v.occurredAt,
    externalId: externalIdFromPath ?? v.externalId,
    metadata: v.metadata,
    tags: v.tags,
    fields: v.fields,
  };

  const ev = externalIdFromPath
    ? await upsertEventByExternalId(externalIdFromPath, data)
    : await createEvent(data);

  if (type === "DEPLOYMENT") {
    try {
      const { attachToAutoLot } = await import("@/lib/autoLot");
      await attachToAutoLot(ev.id);
      const { detectRollbackOnIngest } = await import("@/lib/rollbackDetect");
      await detectRollbackOnIngest(ev.id);
    } catch (e) {
      // Enrichment only (lot grouping, rollback detection): the event itself is
      // saved, so don't fail the ingest — but a silent swallow made real bugs
      // here undiagnosable. Log with enough context to find the event again.
      console.error(`ingest enrichment failed for event ${ev.id}:`, e);
    }
  }

  return ev;
}

/** REST-facing wrapper: same behavior/status codes as before, returning a Response. */
export async function persistValidated<F extends Record<string, unknown>>(
  type: EventType,
  v: ValidatedEvent<F>,
  externalIdFromPath?: string,
): Promise<Response> {
  try {
    const ev = await persistValidatedEvent(type, v, externalIdFromPath);
    const kind = type === "DEPLOYMENT" ? "deploy.created" : type === "INCIDENT" ? "incident.created" : "maintenance.created";
    emitHooks(ev.id, kind);
    return Response.json(ev, { status: externalIdFromPath ? 200 : 201 });
  } catch (e) {
    if (e instanceof ServiceNotFoundError) {
      return Response.json({ error: "service not found" }, { status: 404 });
    }
    if (e instanceof EnvNotActiveError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    if (isUniqueViolation(e)) {
      return Response.json({ error: "an event with this externalId already exists" }, { status: 409 });
    }
    throw e;
  }
}
