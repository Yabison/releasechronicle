/**
 * Append-only trail of security-relevant events.
 *
 * StatusTransition already records who moved a deployment; this covers everything
 * else that a post-incident question would ask about — who logged in (and who
 * failed to), who created or removed a CI token, a hook, a notification target,
 * and who used a one-click link.
 *
 * Writes are best-effort on purpose: an audit insert must never turn a successful
 * login into a 500. A failure is logged and swallowed.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readSessionFromCookieHeader } from "@/lib/auth/session";
import { log } from "@/lib/log";

export type AuditEntry = {
  action: string;
  actor?: string | null;
  actorIp?: string | null;
  target?: string | null;
  detail?: Record<string, unknown> | null;
  ok?: boolean;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actor: entry.actor ?? null,
        actorIp: entry.actorIp ?? null,
        target: entry.target ?? null,
        detail: (entry.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        ok: entry.ok ?? true,
      },
    });
  } catch (e) {
    // Deliberately no `target`: on a failed login it is the attempted username,
    // i.e. unauthenticated input and a real person's name. The audit row is where
    // that belongs; the action and the error are enough to diagnose this failure.
    log.error("audit write failed", { mod: "audit", action: entry.action, err: e });
  }
}

export type AuditFilter = {
  action?: string;
  actor?: string;
  ok?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export type AuditRow = {
  id: string;
  at: Date;
  action: string;
  actor: string | null;
  actorIp: string | null;
  target: string | null;
  detail: unknown;
  ok: boolean;
};

export async function listAuditLog(filter: AuditFilter): Promise<{ rows: AuditRow[]; total: number }> {
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.actor ? { actor: { contains: filter.actor, mode: "insensitive" } } : {}),
    ...(filter.ok !== undefined ? { ok: filter.ok } : {}),
    ...(filter.from || filter.to
      ? { at: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
      : {}),
  };
  const take = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const skip = Math.max(filter.offset ?? 0, 0);
  const [rows, total] = await Promise.all([
    // `at` alone leaves rows written in the same millisecond in an undefined
    // order, which makes pagination lose or repeat them between two pages. The
    // cuid tiebreaker settles it: it carries the creation timestamp and a counter,
    // so it keeps the newest first among ties instead of picking at random.
    prisma.auditLog.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take, skip }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total };
}

/** Client address as the reverse proxy reported it, or null if it sent neither header. */
export function clientIpOf(req: Request): string | null {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || null;
}

/**
 * Record an admin action, taking actor and address from the request. Callers have
 * already passed requireAdmin, so the session is expected to be present.
 */
export async function auditRequest(
  req: Request,
  entry: Omit<AuditEntry, "actor" | "actorIp">,
): Promise<void> {
  const session = await readSessionFromCookieHeader(req.headers.get("cookie"));
  await recordAudit({ ...entry, actor: session?.name ?? null, actorIp: clientIpOf(req) });
}
