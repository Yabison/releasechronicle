import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConnector } from "./registry";
import { transitionMatches } from "./transitions";
import type { HookEvent, HookEventKind } from "./types";
import { nextStatus } from "@/lib/deployWorkflow";
import { signActionToken, actionUrl } from "@/lib/actionToken";

/** Run every matching enabled hook of the event's product through its connector,
 *  isolated, logging each attempt to HookDelivery. Never throws. */
export async function dispatchHooks(eventId: string, kind: HookEventKind, actor?: string | null): Promise<void> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    include: { service: { include: { product: { include: { company: true, hooks: { include: { target: true } } } } } } },
  });
  if (!ev) return;
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

  const hooks = product.hooks.filter(
    (h) =>
      h.enabled &&
      (h.events.includes("*") || h.events.includes(kind)) &&
      (kind !== "deploy.status_changed" || transitionMatches(h.transitions, fromStatus, toStatus)),
  );
  for (const h of hooks) {
    const connector = getConnector(h.type);
    if (!connector) {
      await prisma.hookDelivery.create({
        data: { hookId: h.id, kind, ok: false, error: `unknown connector: ${h.type}`, payload: event as unknown as Prisma.InputJsonValue },
      });
      continue;
    }
    let result;
    try {
      const cfg = (h.target ? h.target.config : h.config) as Record<string, unknown>;
      result = await connector.send(event, cfg ?? {});
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "connector threw" };
    }
    await prisma.hookDelivery.create({
      data: {
        hookId: h.id,
        kind,
        ok: result.ok,
        statusCode: result.statusCode ?? null,
        error: result.error ?? null,
        payload: event as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

/** Fire-and-forget hook dispatch after the response. Returns the dispatch promise
 *  so tests can await it; in a request scope, after() also keeps it alive. */
export function emitHooks(eventId: string, kind: HookEventKind, actor?: string | null): Promise<void> {
  const p = dispatchHooks(eventId, kind, actor);
  try {
    after(() => p);
  } catch {
    // outside a request scope (e.g. tests): the promise already runs.
  }
  return p;
}
