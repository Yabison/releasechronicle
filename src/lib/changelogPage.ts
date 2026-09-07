import type { ChangelogSource } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { getServiceBySlug } from "@/lib/hierarchy";
import { listChangelogs } from "@/lib/changelog";
import { renderChangelog } from "@/lib/changelogRender";
import { isAnonymous, isServicePublic, canReadChangelog } from "@/lib/visibility";

export type RenderedNote = {
  version: string;
  /** HTML déjà assaini — sûr à injecter, jamais à ré-assainir côté client. */
  html: string;
  source: ChangelogSource;
  authorName: string | null;
  updatedAt: Date;
};

/**
 * Tout ce que la page changelog doit savoir, gardes comprises.
 *
 * La logique vit ici plutôt que dans le composant de page pour être testable :
 * ce dépôt n'a aucun test de composant React, donc une page épaisse serait du
 * code non couvert — et ce qu'il y a à couvrir ici, ce sont trois portes de
 * visibilité, pas de la mise en page.
 *
 * `null` signifie « rien à montrer à cet appelant », que le service n'existe pas
 * ou qu'il n'a pas le droit : l'appelant répond `notFound()` dans les deux cas,
 * puisque distinguer les deux dirait déjà que le service existe.
 */
export async function loadServiceChangelog(input: {
  company: string;
  product: string;
  service: string;
  session: SessionUser | null;
}): Promise<{ notes: RenderedNote[] } | null> {
  const { company, product, service, session } = input;

  // Porte 1 : un anonyme ne peut voir que ce que le mode public expose déjà.
  if (isAnonymous(session) && !(await isServicePublic(company, product, service))) return null;
  // Porte 2 : le réglage changelog, qui ne fait que retirer.
  if (!(await canReadChangelog(session))) return null;
  // Porte 3 : le service existe (et n'est pas supprimé).
  const svc = await getServiceBySlug(company, product, service);
  if (!svc) return null;

  const rows = await listChangelogs(svc.id);
  return {
    notes: rows.map((r) => ({
      version: r.version,
      html: renderChangelog(r.body),
      source: r.source,
      authorName: r.authorName,
      updatedAt: r.updatedAt,
    })),
  };
}
