import { z } from "zod";
import { ChangeType, DeployStatus, IncidentStatus } from "@prisma/client";

/** Trimmed, non-empty, capped string — the default for every required text field. */
export const nonEmpty = (max = 1000) => z.string().trim().min(1).max(max);

/** Absent, empty or blank → undefined; otherwise trimmed and capped. Mirrors the old `str()` idiom. */
export const optionalStr = (max = 1000) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

/** Same, but null for DB-nullable columns. */
export const optionalOrNull = (max = 1000) =>
  z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(max).nullable(),
  );

export const commentStr = nonEmpty(5000);

/** ISO-8601 (or anything Date can parse) string → Date. */
export const isoDate = z.string().transform((s, ctx) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "must be a valid date" });
    return z.NEVER;
  }
  return d;
});

export const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, "must be #rrggbb");

export const tagsSchema = z.array(z.string().trim().min(1).max(100)).max(50);

/**
 * Change types no new event may carry.
 *
 * The value stays in the Postgres enum on purpose: events created before it was
 * retired still hold it, and dropping it would fail on any instance that has one.
 * So it remains readable, and reclassification may keep it — see
 * `setEventChangeType`, which refuses it as a *target* unless the event already
 * carries it. What is closed is creation: REST and CI ingest both refuse it.
 */
export const RETIRED_CHANGE_TYPES: readonly ChangeType[] = [ChangeType.POSTMEP_SQL];

/**
 * Derived rather than listed, so a value added to the Prisma enum is creatable by
 * default instead of being silently dropped. tests/lib/schemas/common.test.ts
 * pins that these two sets partition ChangeType exactly.
 */
export const CREATABLE_CHANGE_TYPES = Object.values(ChangeType).filter(
  (c) => !RETIRED_CHANGE_TYPES.includes(c),
);

// zod v4 deprecates `z.nativeEnum()` in favor of `z.enum()`, which now accepts TS enums directly.
/** For creating an event: retired values are refused. */
export const changeTypeSchema = z.enum(CREATABLE_CHANGE_TYPES as [ChangeType, ...ChangeType[]]);
export const deployStatusSchema = z.enum(DeployStatus);
export const incidentStatusSchema = z.enum(IncidentStatus);

/** Bit-compat helper: old handlers silently ignored invalid optional values instead of 400ing. */
export const ignoredIfInvalid = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined);
