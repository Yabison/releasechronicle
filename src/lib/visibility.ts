import { ChangelogVisibility } from "@prisma/client";
import { hasRole, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { invalidateSidebarTree } from "@/lib/cache";

/** Roles allowed to mutate data (create/transition/edit events, admin config). */
export function canWrite(session: SessionUser | null): boolean {
  return hasRole(session, "admin") || hasRole(session, "devops");
}

/** No session at all → public/anonymous visitor, read-only + public-only data. */
export function isAnonymous(session: SessionUser | null): boolean {
  return !session;
}

/** A service is publicly visible only when it and its product and company are all public. */
export async function isServicePublic(companySlug: string, productSlug: string, serviceSlug: string): Promise<boolean> {
  const svc = await prisma.service.findFirst({
    where: {
      slug: serviceSlug, public: true, deletedAt: null,
      product: {
        slug: productSlug, public: true, deletedAt: null,
        company: { slug: companySlug, public: true, deletedAt: null },
      },
    },
    select: { id: true },
  });
  return !!svc;
}

const DEFAULT_PUBLIC_TYPES = ["DEPLOYMENT", "MAINTENANCE"];

/** Global set of event types an anonymous visitor may see. */
export async function getPublicEventTypes(): Promise<string[]> {
  const s = await prisma.publicSetting.findUnique({ where: { id: "singleton" } });
  return s?.eventTypes ?? DEFAULT_PUBLIC_TYPES;
}

export async function setPublicEventTypes(types: string[]): Promise<void> {
  const clean = types.filter((t) => ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"].includes(t));
  await prisma.publicSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", eventTypes: clean },
    update: { eventTypes: clean },
  });
  // The anonymous tree counts only public event types, so its cached copy is now stale.
  await invalidateSidebarTree();
}

const CHANGELOG_MODES = Object.values(ChangelogVisibility) as string[];

/** Qui peut lire les notes de release. Le defaut sur est celui qui ne publie pas. */
export async function getChangelogVisibility(): Promise<ChangelogVisibility> {
  const s = await prisma.publicSetting.findUnique({ where: { id: "singleton" } });
  return s?.changelogVisibility ?? ChangelogVisibility.AUTHENTICATED;
}

export async function setChangelogVisibility(mode: ChangelogVisibility): Promise<void> {
  // Refuser plutot que stocker : une valeur hors enum passerait la colonne en
  // erreur Postgres brute, et un appelant non valide merite un message clair.
  if (!CHANGELOG_MODES.includes(mode)) throw new Error(`unknown changelog visibility: ${mode}`);
  await prisma.publicSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", changelogVisibility: mode },
    update: { changelogVisibility: mode },
  });
}

/**
 * Le reglage ne fait que RETIRER. Un anonyme doit de toute facon satisfaire les
 * regles existantes -- chaine societe/produit/service publique, type DEPLOYMENT
 * public --, verifiees par l'appelant (page ou route). PUBLIC n'ouvre donc jamais
 * un service qu'il n'avait pas deja le droit de voir ; AUTHENTICATED lui retire le
 * changelog qu'il aurait sinon pu lire.
 */
export async function canReadChangelog(session: SessionUser | null): Promise<boolean> {
  if (!isAnonymous(session)) return true;
  return (await getChangelogVisibility()) === ChangelogVisibility.PUBLIC;
}
