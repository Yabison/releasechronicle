import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
// Side-effect import: registers every built-in connector. This is the only
// module that calls getConnector, so importing it here (rather than relying
// on callers to import "@/lib/hooks" first) guarantees the registry is
// populated on every path that reaches dispatch — including the sweep route
// and instrumentation.ts, which otherwise never trigger that side effect and
// would dead-letter every row with "unknown connector".
import "@/lib/hooks";
import { log } from "@/lib/log";
import { getConnector } from "./registry";
import { transitionMatches } from "./transitions";
import type { HookEvent, HookEventKind } from "./types";
import { nextStatus } from "@/lib/deployWorkflow";
import { signActionToken, actionUrl } from "@/lib/actionToken";
import { nextAttemptDelayMs } from "./backoff";

/** While a row is being sent, its nextAttemptAt is pushed this far out so no
 *  concurrent worker re-claims it; a crash mid-send makes it due again after
 *  the lease instead of losing it. Invariant: every connector's worst-case
 *  send duration must stay well under this lease, or a slow send can be
 *  double-delivered once the lease expires and a second worker re-claims it. */
export const CLAIM_LEASE_MS = 600_000;

/** Write one PENDING HookDelivery per matching enabled hook — the queue entry —
 *  and return their ids. The payload is snapshotted here; retries reuse it. */
export async function enqueueHooks(eventId: string, kind: HookEventKind, actor?: string | null): Promise<string[]> {
  const ev = await prisma.event.findUnique({
    // A deleted service or product must not fire hooks: filtering the load itself
    // (rather than checking after) means a deleted chain yields no event and falls
    // through the same `if (!ev) return []` early return as a missing event.
    where: { id: eventId, service: { deletedAt: null, product: { deletedAt: null } } },
    include: { service: { include: { product: { include: { company: true, hooks: true } } } } },
  });
  if (!ev) return [];
  const product = ev.service.product;

  let fromStatus: string | null = null;
  let toStatus: string | null = null;
  if (kind === "deploy.status_changed") {
    const st = await prisma.statusTransition.findFirst({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    });
    fromStatus = st?.fromStatus ?? null;
    toStatus = st?.toStatus ?? null;
  }

  let actionUrlStr = "";
  if (ev.type === "DEPLOYMENT" && ev.deployStatus) {
    const next = nextStatus(ev.deployStatus);
    if (next) actionUrlStr = actionUrl(await signActionToken({ eventId: ev.id, to: next }));
  }

  const event: HookEvent = {
    kind,
    occurredAt: new Date().toISOString(),
    company: product.company.slug,
    product: product.slug,
    service: ev.service.slug,
    environment: ev.environment,
    actor: actor ?? null,
    data: {
      eventId: ev.id,
      type: ev.type,
      version: ev.version,
      deployStatus: ev.deployStatus,
      fromStatus,
      toStatus,
      scheduledAt: ev.scheduledAt ? ev.scheduledAt.toISOString() : null,
      windowStart: ev.windowStart ? ev.windowStart.toISOString() : null,
      windowEnd: ev.windowEnd ? ev.windowEnd.toISOString() : null,
      incidentType: ev.incidentType,
      comment: ev.comment,
      actionUrl: actionUrlStr,
    },
  };
  const payload = event as unknown as Prisma.InputJsonValue;

  const hooks = product.hooks.filter(
    (h) =>
      h.enabled &&
      (h.events.includes("*") || h.events.includes(kind)) &&
      (kind !== "deploy.status_changed" || transitionMatches(h.transitions, fromStatus, toStatus)),
  );

  const now = new Date();
  const ids: string[] = [];
  for (const h of hooks) {
    if (!getConnector(h.type)) {
      // No connector will ever send this: dead on arrival, visible in the admin.
      await prisma.hookDelivery.create({
        data: { hookId: h.id, kind, status: "DEAD", attempts: 0, nextAttemptAt: null, error: `unknown connector: ${h.type}`, payload },
      });
      continue;
    }
    const row = await prisma.hookDelivery.create({
      data: { hookId: h.id, kind, status: "PENDING", attempts: 0, nextAttemptAt: now, payload },
    });
    ids.push(row.id);
  }
  return ids;
}

/** Claim + send each delivery, all in parallel: one slow or throwing connector
 *  never delays the others. Safe to call concurrently (claim is exclusive). */
export async function deliverDeliveries(ids: string[], now: Date = new Date()): Promise<void> {
  await Promise.allSettled(ids.map((id) => attemptDelivery(id, now)));
}

async function attemptDelivery(id: string, now: Date): Promise<void> {
  // Exclusive claim: only one worker moves a due row, and the lease keeps the
  // row invisible to other workers while the send is in flight.
  const claimed = await prisma.hookDelivery.updateMany({
    where: { id, status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
    data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
  });
  if (claimed.count === 0) return;

  try {
    await sendClaimed(id, now);
  } catch (e) {
    // The claim committed — attempts incremented, lease held — but recording the
    // outcome did not. The row is not lost: it becomes due again once the lease
    // expires and a later pass re-claims it. Without this line, though, the whole
    // attempt left no trace anywhere, which is how a database problem here looked
    // exactly like nothing happening at all.
    log.error("hook delivery outcome not recorded; row stays leased until it falls due again", {
      deliveryId: id,
      dueAgainAt: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
      err: e,
    });
  }
}

/** Send a delivery that this worker has already claimed, and record the outcome. */
async function sendClaimed(id: string, now: Date): Promise<void> {
  const row = await prisma.hookDelivery.findUnique({
    where: { id },
    include: { hook: { include: { target: true } } },
  });
  if (!row) return;

  const connector = getConnector(row.hook.type);
  if (!connector) {
    await prisma.hookDelivery.update({
      where: { id },
      data: { status: "DEAD", nextAttemptAt: null, error: `unknown connector: ${row.hook.type}` },
    });
    return;
  }

  let result;
  try {
    // Config is read live (not snapshotted) so a target URL fixed between
    // retries takes effect immediately.
    const cfg = (row.hook.target ? row.hook.target.config : row.hook.config) as Record<string, unknown>;
    result = await connector.send(row.payload as unknown as HookEvent, cfg ?? {});
  } catch (e) {
    result = { ok: false as const, error: e instanceof Error ? e.message : "connector threw" };
  }

  if (result.ok) {
    await prisma.hookDelivery.update({
      where: { id },
      data: { status: "OK", nextAttemptAt: null, statusCode: result.statusCode ?? null, error: null },
    });
    return;
  }
  const delay = nextAttemptDelayMs(row.attempts); // attempts already incremented by the claim
  await prisma.hookDelivery.update({
    where: { id },
    data:
      delay === null
        ? { status: "DEAD", nextAttemptAt: null, statusCode: result.statusCode ?? null, error: result.error ?? null }
        : { status: "FAILED", nextAttemptAt: new Date(now.getTime() + delay), statusCode: result.statusCode ?? null, error: result.error ?? null },
  });
}

/** Enqueue now (awaited by the caller: the queue rows exist before the HTTP
 *  response), deliver after the response. `delivered` resolves when the
 *  immediate attempts finish — tests await it. */
export async function emitHooks(eventId: string, kind: HookEventKind, actor?: string | null): Promise<{ delivered: Promise<void> }> {
  const ids = await enqueueHooks(eventId, kind, actor);
  const delivered = ids.length ? deliverDeliveries(ids) : Promise.resolve();
  try {
    after(() => delivered);
  } catch {
    // outside a request scope (tests, scheduler): the promise already runs.
  }
  return { delivered };
}
