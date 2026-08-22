import { DeployStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { transitionDeployStatus, DeployTransitionError } from "@/lib/events";
import { emitHooks } from "@/lib/hooks/dispatch";
import { scheduledLeadMinutes } from "@/lib/deployConfig";
import { log } from "@/lib/log";
import "@/lib/hooks";

/**
 * Promote GO_CONFIRMED deployments whose scheduledAt is within the lead window to
 * PENDING.
 *
 * `promoted`/`ids` count deployments that actually moved. `notifyFailed` is the
 * subset whose hooks could not be enqueued: those deployments are promoted, but
 * nobody was told. A caller that treats a 200 as "everyone knows" needs to read
 * it — the promotion and the notification are separate outcomes.
 */
export async function promoteScheduledDeployments(
  now: Date = new Date(),
): Promise<{ promoted: number; ids: string[]; notifyFailed: string[] }> {
  const cutoff = new Date(now.getTime() + scheduledLeadMinutes() * 60_000);
  const due = await prisma.event.findMany({
    where: {
      type: "DEPLOYMENT", deployStatus: DeployStatus.GO_CONFIRMED, deletedAt: null,
      scheduledAt: { not: null, lte: cutoff }, service: { deletedAt: null },
    },
    select: { id: true },
  });
  const ids: string[] = [];
  const notifyFailed: string[] = [];
  for (const { id } of due) {
    try {
      // transitionDeployStatus returns null rather than throwing when the row is
      // gone or is not a deployment — hard-deleted between the query above and
      // here. Nothing moved, so nothing may be counted.
      const moved = await transitionDeployStatus(id, { to: DeployStatus.PENDING, actorName: "scheduler", actorEmail: null, comment: null });
      if (!moved) {
        log.warn("scheduled promotion target vanished before it could move", { mod: "scheduler", eventId: id });
        continue;
      }
    } catch (e) {
      if (e instanceof DeployTransitionError) {
        // Expected and harmless: another writer moved this deployment between the
        // query above and now. Debug level because a busy instance does this often.
        log.debug("scheduled promotion skipped, row changed underneath us", { mod: "scheduler", eventId: id, err: e });
      } else {
        // A dead connection, a statement timeout, a rolled-back transaction. Not a
        // race, and filing it under one at debug level would hide an exhausted
        // connection pool behind a response that says nothing was due.
        log.error("scheduled promotion failed", { mod: "scheduler", eventId: id, err: e });
      }
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
      notifyFailed.push(id);
      log.error("scheduled promotion committed but hook enqueue failed; nobody was notified", { mod: "scheduler", eventId: id, err: e });
    }
  }
  return { promoted: ids.length, ids, notifyFailed };
}
