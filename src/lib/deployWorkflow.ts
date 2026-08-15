import { DeployStatus } from "@prisma/client";

/** Canonical forward order of deployment statuses. */
export const DEPLOY_ORDER: DeployStatus[] = [
  DeployStatus.SCHEDULED,
  DeployStatus.GO_CONFIRMED,
  DeployStatus.PENDING,
  DeployStatus.IN_PROGRESS,
  DeployStatus.DEPLOYED,
  DeployStatus.TESTING,
  DeployStatus.VALIDATE,
];

export type RoleGroup = "devops" | "qa";

/** devops owns PENDING/IN_PROGRESS/DEPLOYED; qa owns TESTING/VALIDATE. Label only. */
export function roleGroup(status: DeployStatus): RoleGroup {
  return status === DeployStatus.TESTING || status === DeployStatus.VALIDATE
    ? "qa"
    : "devops";
}

/** The single legal next status, or null if already at the end (VALIDATE). */
export function nextStatus(current: DeployStatus): DeployStatus | null {
  const i = DEPLOY_ORDER.indexOf(current);
  return i >= 0 && i < DEPLOY_ORDER.length - 1 ? DEPLOY_ORDER[i + 1] : null;
}

/** The status one step before `current`, or null if it is the first (PENDING). */
export function previousStatus(current: DeployStatus): DeployStatus | null {
  const i = DEPLOY_ORDER.indexOf(current);
  return i > 0 ? DEPLOY_ORDER[i - 1] : null;
}

/** True only when `to` is exactly one step forward from `from`. No skip, no backward. */
export function canTransition(from: DeployStatus, to: DeployStatus): boolean {
  return nextStatus(from) === to;
}

/** A comment is mandatory only for the transition to VALIDATE. */
export function commentRequired(to: DeployStatus): boolean {
  return to === DeployStatus.VALIDATE;
}
