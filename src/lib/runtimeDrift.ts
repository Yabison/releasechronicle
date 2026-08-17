import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/http";

export type DriftResult = { drift: boolean; running: string; expected: string | null; incidentId?: string };

/**
 * Record the build actually running on a server for a service+environment and compare it to
 * the last DEPLOYED build the app knows. On a mismatch, open a BUILD_DRIFT incident (once);
 * when they match again, auto-resolve any open one. Returns the drift status.
 */
export async function reportRuntimeBuild(input: { serviceId: string; environment: string; build: string }): Promise<DriftResult> {
  await prisma.runtimeState.upsert({
    where: { serviceId_environment: { serviceId: input.serviceId, environment: input.environment } },
    create: { serviceId: input.serviceId, environment: input.environment, build: input.build },
    update: { build: input.build, reportedAt: new Date() },
  });

  const last = await prisma.event.findFirst({
    where: {
      serviceId: input.serviceId, environment: input.environment, type: "DEPLOYMENT",
      deployStatus: "DEPLOYED", deletedAt: null,
    },
    orderBy: { occurredAt: "desc" },
    select: { version: true },
  });
  const expected = last?.version ?? null;
  const drift = expected !== null && expected !== input.build;

  const openDrift = await prisma.event.findFirst({
    where: {
      serviceId: input.serviceId, environment: input.environment, type: "INCIDENT",
      incidentType: "BUILD_DRIFT", resolvedAt: null, deletedAt: null,
    },
    select: { id: true },
  });

  if (drift && !openDrift) {
    try {
      const incident = await prisma.event.create({
        data: {
          serviceId: input.serviceId, environment: input.environment, type: "INCIDENT",
          occurredAt: new Date(), startedAt: new Date(),
          incidentType: "BUILD_DRIFT", incidentStatus: "INVESTIGATING",
          comment: `Dérive de build : tourne ${input.build}, attendu ${expected}`,
          source: "API",
        },
        select: { id: true },
      });
      return { drift, running: input.build, expected, incidentId: incident.id };
    } catch (e) {
      // Two agents reporting the same drift can both pass the check above; the
      // partial unique index (one OPEN drift per service+env) turns the loser's
      // create into a P2002. The incident exists either way — fetch and return it.
      if (!isUniqueViolation(e)) throw e;
      const existing = await prisma.event.findFirst({
        where: {
          serviceId: input.serviceId, environment: input.environment, type: "INCIDENT",
          incidentType: "BUILD_DRIFT", resolvedAt: null, deletedAt: null,
        },
        select: { id: true },
      });
      return { drift, running: input.build, expected, incidentId: existing?.id };
    }
  }
  if (!drift && openDrift) {
    await prisma.event.update({ where: { id: openDrift.id }, data: { resolvedAt: new Date(), incidentStatus: "RESOLVED" } });
  }
  return { drift, running: input.build, expected, incidentId: openDrift?.id };
}
