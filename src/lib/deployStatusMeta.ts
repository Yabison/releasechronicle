import { DeployStatus } from "@prisma/client";

export type StatusMeta = { label: string; color: string };

/** Display metadata (label + hex color) for each deploy status. Shared by the
 *  timeline, the transition modal, and the per-row status pill. */
export const STATUS_META: Record<DeployStatus, StatusMeta> = {
  SCHEDULED: { label: "SCHEDULED", color: "#a855f7" },
  PENDING: { label: "PENDING", color: "#64748b" },
  GO_CONFIRMED: { label: "GO_CONFIRMED", color: "#06b6d4" },
  IN_PROGRESS: { label: "IN_PROGRESS", color: "#3b82f6" },
  DEPLOYED: { label: "DEPLOYED", color: "#6366f1" },
  TESTING: { label: "TESTING", color: "#f59e0b" },
  VALIDATE: { label: "VALIDATE", color: "#22c55e" },
};

export const ROLLBACK_COLOR = "#ef4444";

/** CSS variable holding the text-safe colour of each status.
 *  STATUS_META.color is a pill *fill*, meant to sit under white text; used as a
 *  font colour on white it drops as low as 2.15:1. These tokens are the
 *  readable counterparts, and they follow the theme. */
export const STATUS_TEXT_VAR: Record<DeployStatus, string> = {
  SCHEDULED: "var(--st-scheduled)",
  GO_CONFIRMED: "var(--st-go)",
  PENDING: "var(--st-pending)",
  IN_PROGRESS: "var(--st-progress)",
  DEPLOYED: "var(--st-deployed)",
  TESTING: "var(--st-testing)",
  VALIDATE: "var(--st-validate)",
};
