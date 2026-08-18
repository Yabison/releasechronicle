import type { EntryCategory } from "./eventTimeline";

/**
 * Which glyph leads a timeline row.
 *
 * Pure and separate from the component so the priority rule is testable on its
 * own — the same split as entrySeverity().
 *
 * A deployment is read by its **status**, not its category: the row already
 * spells out RELEASE / HOTFIX in the type column, so repeating it in the icon
 * would waste the one slot the eye lands on first. What that slot answers is
 * "where is this in the pipeline, and is it in trouble".
 *
 * `danger` overrides everything. An entry reading DEPLOYED, or even VALIDATE,
 * that rolled back or left a lot half-rolled-back is the case this exists to
 * surface.
 *
 * Entries with no deploy status — incidents, maintenances — keep their own
 * glyph, since the pipeline says nothing about them.
 */
export type LeadIcon =
  | "danger"
  | "scheduled"
  | "waiting"
  | "running"
  | "validated"
  | "release"
  | "hotfix"
  | "incident"
  | "maintenance";

export type LeadIconInput = {
  category: EntryCategory;
  /** DeployStatus, or null on an incident or a maintenance. */
  deployStatus: string | null;
  /** The deployment has at least one rollback. */
  hasRollback: boolean;
  /** Some sibling of its lot was not rolled back with it. */
  lotIncomplete: boolean;
};

/** DEPLOYED and TESTING count as in flight: validation still stands between
 *  them and a finished release. */
const BY_STATUS: Record<string, LeadIcon> = {
  SCHEDULED: "scheduled",
  GO_CONFIRMED: "scheduled",
  PENDING: "waiting",
  IN_PROGRESS: "running",
  DEPLOYED: "running",
  TESTING: "running",
  VALIDATE: "validated",
};

const BY_CATEGORY: Record<EntryCategory, LeadIcon> = {
  DEPLOY: "release",
  HOTFIX: "hotfix",
  INCIDENT: "incident",
  MAINTENANCE: "maintenance",
};

export function rowLeadIcon({ category, deployStatus, hasRollback, lotIncomplete }: LeadIconInput): LeadIcon {
  if (hasRollback || lotIncomplete) return "danger";
  if (deployStatus && BY_STATUS[deployStatus]) return BY_STATUS[deployStatus];
  return BY_CATEGORY[category];
}
