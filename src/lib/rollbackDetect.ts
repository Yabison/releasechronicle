import { prisma } from "@/lib/db";

export const ROLLBACK_TAG = "rollback";

function parseBuild(v: string | null | undefined): number | null {
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : null;
}

/**
 * On a newly ingested deployment, detect a rollback by build number: if this deploy's
 * (numeric) build is lower than the immediately previous deployment with a numeric build
 * in the same service + environment, that previous higher build was reverted — tag it
 * "rollback".
 *
 * Idempotent (won't re-add the tag) and a no-op for non-numeric versions.
 * Fire-and-forget from the ingest paths; failures must never break ingest.
 */
export async function detectRollbackOnIngest(eventId: string): Promise<{ flagged: string | null }> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { serviceId: true, environment: true, occurredAt: true, version: true, type: true, deletedAt: true },
  });
  if (!ev || ev.type !== "DEPLOYMENT" || ev.deletedAt) return { flagged: null };
  const build = parseBuild(ev.version);
  if (build === null) return { flagged: null };

  // The most recent earlier deployments (same service+env) that carry a version; the first
  // one with a numeric build is the "immediately previous" build to compare against.
  const candidates = await prisma.event.findMany({
    where: {
      serviceId: ev.serviceId, environment: ev.environment, type: "DEPLOYMENT", deletedAt: null,
      occurredAt: { lt: ev.occurredAt }, version: { not: null },
    },
    orderBy: { occurredAt: "desc" },
    take: 10,
    select: { id: true, version: true, tags: true },
  });
  const prev = candidates
    .map((c) => ({ id: c.id, build: parseBuild(c.version), tags: c.tags }))
    .find((c) => c.build !== null);
  if (!prev || prev.build === null || prev.build <= build) return { flagged: null };

  // Idempotent: skip if already tagged.
  if (prev.tags.includes(ROLLBACK_TAG)) return { flagged: null };

  await prisma.event.update({ where: { id: prev.id }, data: { tags: { push: ROLLBACK_TAG } } });
  // The rollback was caused by the release it reverts.
  await prisma.event.update({ where: { id: eventId }, data: { causedById: prev.id } });
  return { flagged: prev.id };
}
