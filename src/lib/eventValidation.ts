import { ChangeType, DeployStatus, IncidentStatus } from "@prisma/client";

export type ServiceRef = { company: string; product: string; service: string };

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type ValidatedEvent<F> = {
  service: ServiceRef;
  environment: string;
  occurredAt: Date;
  externalId?: string;
  metadata?: unknown;
  tags?: string[];
  fields: F;
};

const CHANGE_TYPES = Object.values(ChangeType) as string[];
const DEPLOY_STATUSES = Object.values(DeployStatus) as string[];
const INCIDENT_STATUSES = Object.values(IncidentStatus) as string[];

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEnvelope(
  body: Record<string, unknown>,
): ValidationResult<Omit<ValidatedEvent<unknown>, "occurredAt" | "fields">> {
  if (!str(body.company) || !str(body.product) || !str(body.service)) {
    return { ok: false, error: "company, product, and service slugs are required" };
  }
  if (typeof body.environment !== "string" || body.environment.trim() === "") {
    return { ok: false, error: "environment is required" };
  }
  const tags =
    Array.isArray(body.tags) && body.tags.every((t) => typeof t === "string")
      ? (body.tags as string[])
      : undefined;
  return {
    ok: true,
    value: {
      service: { company: body.company, product: body.product, service: body.service },
      environment: body.environment,
      externalId: str(body.externalId) ? (body.externalId as string) : undefined,
      metadata: "metadata" in body ? body.metadata : undefined,
      tags,
    },
  };
}

function asObject(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

// ─── Deployment ───────────────────────────────────────────────────────────────

export type DeploymentFields = {
  version: string;
  comment: string | null;
  lot: string;
  requester: string;
  changeType: ChangeType;
  externalLink: string | null;
  deployStatus: DeployStatus;
  scheduledAt: Date | null;
  parentId: string | null;
  hourType: string | null;
};

export function validateDeploymentBody(
  raw: unknown,
): ValidationResult<ValidatedEvent<DeploymentFields>> {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "body must be an object" };
  const env = parseEnvelope(body);
  if (!env.ok) return env;
  if (typeof body.changeType !== "string" || !CHANGE_TYPES.includes(body.changeType)) {
    return { ok: false, error: `a valid changeType (${CHANGE_TYPES.join("|")}) is required` };
  }
  const isPhase = body.changeType === "PRE_MEP" || body.changeType === "POST_MEP";
  // Version is optional for PRE/POST MEP; required otherwise.
  if (!isPhase && !str(body.version)) return { ok: false, error: "version is required" };
  if (!str(body.requester)) return { ok: false, error: "requester is required" };
  const parentId = str(body.parentId) ? (body.parentId as string) : null;
  if (isPhase && !parentId) {
    return { ok: false, error: "parentId (MEP/HOTFIX lié) is required for PRE_MEP/POST_MEP" };
  }
  const comment = str(body.comment) ? (body.comment as string) : null;
  if (isPhase && !comment) return { ok: false, error: "un commentaire est requis pour PRE/POST MEP" };
  let deployStatus: DeployStatus = DeployStatus.PENDING;
  if ("deployStatus" in body && body.deployStatus !== undefined) {
    if (typeof body.deployStatus !== "string" || !DEPLOY_STATUSES.includes(body.deployStatus)) {
      return { ok: false, error: `deployStatus must be ${DEPLOY_STATUSES.join("|")}` };
    }
    deployStatus = body.deployStatus as DeployStatus;
  }
  const occurredAt = "occurredAt" in body ? parseDate(body.occurredAt) : new Date();
  if (occurredAt === null) return { ok: false, error: "occurredAt is not a valid date" };
  let scheduledAt: Date | null = null;
  if ("scheduledAt" in body && body.scheduledAt !== undefined && body.scheduledAt !== null) {
    scheduledAt = parseDate(body.scheduledAt);
    if (scheduledAt === null) return { ok: false, error: "scheduledAt is not a valid date" };
  }
  if (deployStatus === "SCHEDULED" && scheduledAt === null) {
    return { ok: false, error: "scheduledAt is required when deployStatus is SCHEDULED" };
  }
  return {
    ok: true,
    value: {
      ...env.value,
      occurredAt,
      fields: {
        version: str(body.version) ? (body.version as string) : "",
        comment,
        lot: str(body.lot) ? (body.lot as string) : (str(body.version) ? (body.version as string) : ""),
        requester: body.requester,
        changeType: body.changeType as ChangeType,
        externalLink: str(body.externalLink) ? (body.externalLink as string) : null,
        deployStatus,
        scheduledAt,
        parentId,
        hourType: body.hourType === "HO" || body.hourType === "HNO" ? body.hourType : null,
      },
    },
  };
}

// ─── Incident ─────────────────────────────────────────────────────────────────

export type IncidentFields = {
  incidentType: string;
  incidentStatus: IncidentStatus;
  startedAt: Date;
  resolvedAt: Date | null;
  comment: string | null;
};

export function validateIncidentBody(
  raw: unknown,
): ValidationResult<ValidatedEvent<IncidentFields>> {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "body must be an object" };
  const env = parseEnvelope(body);
  if (!env.ok) return env;
  if (!str(body.incidentType)) return { ok: false, error: "incidentType is required" };
  const startedAt = parseDate(body.startedAt);
  if (startedAt === null) return { ok: false, error: "startedAt is required and must be a date" };
  let resolvedAt: Date | null = null;
  if ("resolvedAt" in body && body.resolvedAt !== undefined && body.resolvedAt !== null) {
    resolvedAt = parseDate(body.resolvedAt);
    if (resolvedAt === null) return { ok: false, error: "resolvedAt must be a date" };
  }
  let incidentStatus: IncidentStatus = resolvedAt ? IncidentStatus.RESOLVED : IncidentStatus.INVESTIGATING;
  if ("incidentStatus" in body && body.incidentStatus !== undefined) {
    if (typeof body.incidentStatus !== "string" || !INCIDENT_STATUSES.includes(body.incidentStatus)) {
      return { ok: false, error: `incidentStatus must be ${INCIDENT_STATUSES.join("|")}` };
    }
    incidentStatus = body.incidentStatus as IncidentStatus;
  }
  return {
    ok: true,
    value: {
      ...env.value,
      occurredAt: startedAt,
      fields: {
        incidentType: body.incidentType,
        incidentStatus,
        startedAt,
        resolvedAt,
        comment: str(body.comment) ? (body.comment as string) : null,
      },
    },
  };
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

export type MaintenanceFields = {
  version: string | null;
  windowStart: Date;
  windowEnd: Date;
};

export function validateMaintenanceBody(
  raw: unknown,
): ValidationResult<ValidatedEvent<MaintenanceFields>> {
  const body = asObject(raw);
  if (!body) return { ok: false, error: "body must be an object" };
  const env = parseEnvelope(body);
  if (!env.ok) return env;
  const windowStart = parseDate(body.windowStart);
  const windowEnd = parseDate(body.windowEnd);
  if (windowStart === null) {
    return { ok: false, error: "windowStart is required and must be a date" };
  }
  if (windowEnd === null) {
    return { ok: false, error: "windowEnd is required and must be a date" };
  }
  if (windowEnd < windowStart) {
    return { ok: false, error: "windowEnd must be after windowStart" };
  }
  return {
    ok: true,
    value: {
      ...env.value,
      occurredAt: windowStart,
      fields: {
        version: str(body.version) ? (body.version as string) : null,
        windowStart,
        windowEnd,
      },
    },
  };
}
