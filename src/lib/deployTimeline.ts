import { DeployStatus } from "@prisma/client";
import { DEPLOY_ORDER, nextStatus } from "@/lib/deployWorkflow";

export type StepState = "done" | "current" | "next" | "future";

/**
 * For each status in DEPLOY_ORDER, its render state given the current status.
 * null current = nothing reached: DEPLOY_ORDER[0] (SCHEDULED) is `next`, all others `future`.
 * Otherwise: statuses before current = `done`, current = `current`,
 * nextStatus(current) = `next`, everything else = `future`.
 */
export function stepStates(current: DeployStatus | null): { status: DeployStatus; state: StepState }[] {
  const next = current === null ? DEPLOY_ORDER[0] : nextStatus(current);
  const currentIdx = current === null ? -1 : DEPLOY_ORDER.indexOf(current);
  return DEPLOY_ORDER.map((status, i) => {
    let state: StepState;
    if (status === current) state = "current";
    else if (status === next) state = "next";
    else if (i < currentIdx) state = "done";
    else state = "future";
    return { status, state };
  });
}
