import type { Prisma, ChangelogSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";

export type ChangelogRow = {
  version: string;
  body: string;
  source: ChangelogSource;
  authorName: string | null;
  updatedAt: Date;
};

const SELECT = { version: true, body: true, source: true, authorName: true, updatedAt: true } as const;

/**
 * Toutes les notes d'un service, release la plus récente d'abord.
 *
 * L'ordre est celui de `createdAt` — la date du premier déploiement de la version —
 * et non celui de `version` : un numéro de version est une chaîne, et trier
 * "10.0.0" après "9.0.0" demanderait un comparateur semver que rien ne garantit
 * ici (les versions maison, les dates, les hashes de commit passent tous par là).
 */
export function listChangelogs(serviceId: string): Promise<ChangelogRow[]> {
  return prisma.changelog.findMany({ where: { serviceId }, select: SELECT, orderBy: { createdAt: "desc" } });
}

export function getChangelog(serviceId: string, version: string): Promise<ChangelogRow | null> {
  return prisma.changelog.findUnique({ where: { serviceId_version: { serviceId, version } }, select: SELECT });
}

/**
 * Écriture par la CI.
 *
 * Une promotion d'environnement rejoue le même payload pour une version déjà
 * déployée, donc cette fonction est idempotente — et surtout elle respecte le
 * verrou : dès qu'un humain a édité la note, la CI ne la réécrit plus. Sans cette
 * règle, la correction manuelle disparaîtrait au prochain déploiement de la même
 * version, c'est-à-dire précisément quand on en a besoin.
 *
 * Le refus est loggé : une note qui ne bouge pas sans rien dire est indiagnosticable.
 */
export async function upsertChangelogFromCi(
  serviceId: string,
  version: string,
  body: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ written: boolean }> {
  const existing = await tx.changelog.findUnique({
    where: { serviceId_version: { serviceId, version } },
    select: { source: true },
  });
  if (existing?.source === "UI") {
    log.info("changelog kept: edited by hand, CI update ignored", { mod: "changelog", serviceId, version });
    return { written: false };
  }
  await tx.changelog.upsert({
    where: { serviceId_version: { serviceId, version } },
    create: { serviceId, version, body, source: "CI" },
    update: { body, source: "CI" },
  });
  return { written: true };
}

/** Édition manuelle : écrit la note ET la verrouille contre les envois CI suivants. */
export function setManualChangelog(
  serviceId: string,
  version: string,
  body: string,
  authorName: string,
): Promise<ChangelogRow> {
  return prisma.changelog.upsert({
    where: { serviceId_version: { serviceId, version } },
    create: { serviceId, version, body, source: "UI", authorName },
    update: { body, source: "UI", authorName },
    select: SELECT,
  });
}

/**
 * Rend la version à la CI : le prochain déploiement réécrira la note. L'auteur
 * part avec le verrou — le garder désignerait quelqu'un comme responsable d'un
 * texte que la CI va remplacer.
 */
export async function releaseChangelogToCi(serviceId: string, version: string): Promise<ChangelogRow | null> {
  const { count } = await prisma.changelog.updateMany({
    where: { serviceId, version },
    data: { source: "CI", authorName: null },
  });
  return count === 0 ? null : getChangelog(serviceId, version);
}
