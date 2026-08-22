import { DeployStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { transitionDeployStatus } from "@/lib/events";
import { emitHooks } from "@/lib/hooks/dispatch";
import { scheduledLeadMinutes } from "@/lib/deployConfig";
import { log } from "@/lib/log";
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
    } catch (e) {
      // Expected and harmless: another writer moved this deployment between the
      // query above and now. Debug level because a busy instance does this often.
      log.debug("scheduled promotion skipped, row changed underneath us", { eventId: id, err: e });
      continue;
    }
    // The transition committed, so the deployment IS promoted — count it even when
    // the notification below fails. One shared catch used to conflate the two, so
    // an enqueue failure made `promoted` undercount a promotion that had actually
    // happened, and left nothing to distinguish it from the expected race.
    ids.push(id);
    try {
      await emitHooks(id, "deploy.status_changed", "scheduler");
    } catch (e) {
      log.error("scheduled promotion committed but hook enqueue failed; nobody was notified", { eventId: id, err: e });
    }
  }
  return { promoted: ids.length, ids };
}
