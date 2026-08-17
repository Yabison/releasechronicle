import type { EntryCategory } from "./eventTimeline";

/**
 * Which glyph leads a timeline row.
 *
 * Pure and separate from the component so the priority rule is testable on its
 * own — the same split as entrySeverity().
 *
 * `danger` is a priority override, not a fifth category: an entry whose status
 * reads DEPLOYED but which rolled back, or which left a lot half-rolled-back, is
 * the case this exists to surface. It wins over the category glyph.
 *
 * Deliberate deviation from the brief, which put every `hasError` entry on
 * danger: an open incident keeps the incident triangle. The triangle already
 * says "something is wrong"; swapping it for the danger circle would claim
 * "this entry has a deployment problem", which is a different statement. The
 * category dot beside the icon carries the type either way.
 */
export type LeadIcon = "danger" | "release" | "hotfix" | "incident" | "maintenance";

export type LeadIconInput = {
  category: EntryCategory;
  /** The deployment has at least one rollback. */
  hasRollback: boolean;
  /** Some sibling of its lot was not rolled back with it. */
  lotIncomplete: boolean;
};

const BY_CATEGORY: Record<EntryCategory, LeadIcon> = {
  DEPLOY: "release",
  HOTFIX: "hotfix",
  INCIDENT: "incident",
  MAINTENANCE: "maintenance",
};

export function rowLeadIcon({ category, hasRollback, lotIncomplete }: LeadIconInput): LeadIcon {
  if (hasRollback || lotIncomplete) return "danger";
  return BY_CATEGORY[category];
}
