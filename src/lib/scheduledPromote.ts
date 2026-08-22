import { DeployStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { transitionDeployStatus } from "@/lib/events";
import { emitHooks } from "@/lib/hooks/dispatch";
import { scheduledLeadMinutes } from "@/lib/deployConfig";
import "@/lib/hooks";

/** Promote GO_CONFIRMED deployments whose scheduledAt is within the lead window to PENDING. */
export async function promoteScheduledDeployments(now: Date = new Date()): Promise<{ promoted: number; ids: string[] }> {
  const cutoff = new Date(now.getTime() + scheduledLeadMinutes() * 60_000);
  const due = await prisma.event.findMany({
    where: {
      type: "DEPLOYMENT", deployStatus: DeployStatus.GO_CONFIRMED, deletedAt: null,
      scheduledAt: { not: null, lte: cutoff }, service: { deletedAt: null },
    },
    select: { id: true },
  });
  const ids: string[] = [];
  for (const { id } of due) {
    try {
      await transitionDeployStatus(id, { to: DeployStatus.PENDING, actorName: "scheduler", actorEmail: null, comment: null });
      await emitHooks(id, "deploy.status_changed", "scheduler");
      ids.push(id);
    } catch {
      // skip a row that raced/changed underneath us
    }
  }
  return { promoted: ids.length, ids };
}
