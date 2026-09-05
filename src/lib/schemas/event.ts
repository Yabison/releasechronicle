import { z } from "zod";
import { ChangeType, DeployStatus, IncidentStatus } from "@prisma/client";
import {
  nonEmpty, optionalStr, optionalOrNull, commentStr, changelogStr, isoDate, tagsSchema,
  changeTypeSchema, deployStatusSchema, incidentStatusSchema, ignoredIfInvalid,
} from "./common";

/**
 * Shared REST envelope: who the event belongs to, plus the passthrough extras.
 *
 * Deliberate deviation from the old hand-written event validator: `nonEmpty`/`optionalStr`
 * trim before storing. The old validator checked `.trim() !== ""` but persisted the
 * raw value, so a padded `company`/`requester` passed validation and then broke
 * `getServiceBySlug` lookups downstream — trimming here fixes that latent bug.
 * One asymmetry this introduces: the upsert path's `externalIdFromPath` (from
 * the URL, not this schema) is NOT trimmed, so a body-supplied `externalId` is
 * now trimmed while a path-supplied one stays raw. Accepted as pathological.
 *
 * Reject, don't silently ignore: a non-string where a string is expected now
 * 400s, whereas the old `str()` helper treated it as absent. Deliberate — it
 * matches the CI schema, which already 400ed on the same input shape; making
 * REST looser here would re-create the REST/CI drift this chantier removed.
 * Affects six fields: `externalId`, deployment `version`, `lot`,
 * `externalLink`, `parentId`, and maintenance `version`. Exception: the
 * batch-1 route ids (`companyId`/`productId`/`buildUrlTemplate`) keep
 * silent-ignore — those PUTs mix that field with others, so dropping it
 * silently is load-bearing there.
 */
const envelope = {
  company: nonEmpty(),
  product: nonEmpty(),
  service: nonEmpty(),
  environment: nonEmpty(),
  externalId: optionalStr(),
  metadata: z.unknown().optional(),
  // Old code fell back to undefined on a non-conforming tags value — keep that.
  tags: ignoredIfInvalid(tagsSchema),
};

const toEnvelope = (v: {
  company: string; product: string; service: string; environment: string;
  externalId?: string; metadata?: unknown; tags?: string[];
}) => ({
  service: { company: v.company, product: v.product, service: v.service },
  environment: v.environment,
  externalId: v.externalId,
  metadata: v.metadata,
  tags: v.tags,
});

// ─── Deployment ───────────────────────────────────────────────────────────────

export const deploymentBodySchema = z
  .object({
    ...envelope,
    version: optionalStr(),
    comment: ignoredIfInvalid(commentStr),
    lot: optionalStr(),
    requester: nonEmpty(),
    changeType: changeTypeSchema,
    externalLink: optionalOrNull(),
    deployStatus: deployStatusSchema.default(DeployStatus.PENDING),
    occurredAt: isoDate.optional(),
    scheduledAt: isoDate.nullish(),
    parentId: optionalStr(),
    hourType: z.unknown().optional(),
    changelog: changelogStr,
  })
  .superRefine((b, ctx) => {
    const isPhase = b.changeType === ChangeType.PRE_MEP || b.changeType === ChangeType.POST_MEP;
    if (!isPhase && !b.version) {
      ctx.addIssue({ code: "custom", path: ["version"], message: "version is required" });
    }
    if (isPhase && !b.parentId) {
      ctx.addIssue({ code: "custom", path: ["parentId"], message: "parentId is required for PRE_MEP/POST_MEP" });
    }
    if (isPhase && !b.comment) {
      ctx.addIssue({ code: "custom", path: ["comment"], message: "a comment is required for PRE_MEP/POST_MEP" });
    }
    if (b.deployStatus === DeployStatus.SCHEDULED && b.scheduledAt == null) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is required when deployStatus is SCHEDULED" });
    }
  })
  .transform((b) => ({
    ...toEnvelope(b),
    occurredAt: b.occurredAt ?? new Date(),
    // Au niveau racine, pas dans `fields` : la note appartient a la release, pas
    // aux colonnes de l'evenement.
    changelog: b.changelog,
    fields: {
      version: b.version ?? "",
      comment: b.comment ?? null,
      lot: b.lot ?? b.version ?? "",
      requester: b.requester,
      changeType: b.changeType,
      externalLink: b.externalLink,
      deployStatus: b.deployStatus,
      scheduledAt: b.scheduledAt ?? null,
      parentId: b.parentId ?? null,
      hourType: b.hourType === "HO" || b.hourType === "HNO" ? b.hourType : null,
    },
  }));

// ─── Incident ─────────────────────────────────────────────────────────────────

export const incidentBodySchema = z
  .object({
    ...envelope,
    incidentType: nonEmpty(),
    startedAt: isoDate,
    resolvedAt: isoDate.nullish(),
    incidentStatus: incidentStatusSchema.optional(),
    comment: ignoredIfInvalid(commentStr),
  })
  .transform((b) => ({
    ...toEnvelope(b),
    occurredAt: b.startedAt,
    fields: {
      incidentType: b.incidentType,
      incidentStatus: b.incidentStatus ?? (b.resolvedAt ? IncidentStatus.RESOLVED : IncidentStatus.INVESTIGATING),
      startedAt: b.startedAt,
      resolvedAt: b.resolvedAt ?? null,
      comment: b.comment ?? null,
    },
  }));

// ─── Maintenance ──────────────────────────────────────────────────────────────

export const maintenanceBodySchema = z
  .object({
    ...envelope,
    windowStart: isoDate,
    windowEnd: isoDate,
    version: optionalOrNull(),
  })
  .superRefine((b, ctx) => {
    if (b.windowEnd < b.windowStart) {
      ctx.addIssue({ code: "custom", path: ["windowEnd"], message: "windowEnd must be after windowStart" });
    }
  })
  .transform((b) => ({
    ...toEnvelope(b),
    occurredAt: b.windowStart,
    fields: { version: b.version, windowStart: b.windowStart, windowEnd: b.windowEnd },
  }));

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidatedDeployment = z.output<typeof deploymentBodySchema>;
export type ValidatedIncident = z.output<typeof incidentBodySchema>;
export type ValidatedMaintenance = z.output<typeof maintenanceBodySchema>;
export type ValidatedEventBody = ValidatedDeployment | ValidatedIncident | ValidatedMaintenance;

/** Structural shape persistValidatedEvent consumes; generic over the per-type fields. */
export type EventBodyShape<F extends Record<string, unknown> = Record<string, unknown>> = {
  service: { company: string; product: string; service: string };
  environment: string;
  occurredAt: Date;
  externalId?: string;
  metadata?: unknown;
  tags?: string[];
  /** Note de release. Portee par le payload de deploiement uniquement. */
  changelog?: string;
  fields: F;
};
