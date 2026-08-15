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
