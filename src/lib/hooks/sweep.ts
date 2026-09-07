import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { deliverDeliveries } from "./dispatch";

/** A PENDING row older than this had its immediate send die with the process —
 *  the sweeper adopts it. Must exceed any plausible send duration. */
export const PENDING_GRACE_MS = 300_000;
export const SWEEP_BATCH = 50;
const DAY_MS = 86_400_000;

function retentionDays(): number {
  const n = Number(process.env.RC_HOOK_DELIVERY_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/** One pass: retry due FAILED rows and orphaned PENDING rows (batched), then
 *  purge terminal rows past retention. Every trigger funnels through here.
 *  `retried` is the count of due rows selected and handed to delivery this
 *  pass — a concurrent worker may already have claimed some of them, so this
 *  is an upper bound on rows actually re-attempted, not a delivery-success count. */
export async function sweepHookDeliveries(now: Date = new Date()): Promise<{ retried: number; purged: number }> {
  const due = await prisma.hookDelivery.findMany({
    where: {
      OR: [
        { status: "FAILED", nextAttemptAt: { lte: now } },
        { status: "PENDING", nextAttemptAt: { lte: new Date(now.getTime() - PENDING_GRACE_MS) } },
      ],
    },
    select: { id: true },
    orderBy: { nextAttemptAt: "asc" },
    take: SWEEP_BATCH,
  });
  if (due.length > 0) await deliverDeliveries(due.map((d) => d.id), now);

  const cutoff = new Date(now.getTime() - retentionDays() * DAY_MS);
  const purged = await prisma.hookDelivery.deleteMany({
    where: { status: { in: ["OK", "DEAD"] }, createdAt: { lt: cutoff } },
  });
  return { retried: due.length, purged: purged.count };
}

/** In-process trigger. A tick is skipped while the previous sweep is running;
 *  unref keeps the timer from holding the process open. */
export function startHookSweeper(intervalMs = 60_000, sweep: () => Promise<unknown> = sweepHookDeliveries): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void sweep()
      .catch((e) => log.error("hook sweep failed", { mod: "hooks", err: e }))
      .finally(() => { running = false; });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
