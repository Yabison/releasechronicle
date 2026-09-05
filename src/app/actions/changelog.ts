"use server";

import { revalidatePath } from "next/cache";
import { changelogStr } from "@/lib/schemas/common";
import { getServiceBySlug } from "@/lib/hierarchy";
import { setManualChangelog, releaseChangelogToCi } from "@/lib/changelog";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/visibility";
import { recordAudit } from "@/lib/audit";
import { fail, type ActionFailure } from "@/lib/actionError";

type Target = { company: string; product: string; service: string; version: string; path: string };

/** `company/product/service@version` — ce que l'audit doit montrer pour situer l'écriture. */
const targetLabel = (t: Target) => `${t.company}/${t.product}/${t.service}@${t.version}`;

/**
 * Une server action est un POST public : elle garde la session ET le rôle
 * d'écriture, comme createRollbackAction. Le token REST ne l'ouvre pas — c'est
 * l'entrée humaine, pas l'entrée machine.
 */
async function requireWriter() {
  const session = await getSession();
  if (!session) return { ok: false as const, res: fail("err.loginRequired") };
  if (!canWrite(session)) return { ok: false as const, res: fail("err.roleRequired", { role: "devops" }) };
  return { ok: true as const, session };
}

/** Édition manuelle d'une note : l'écrit et la verrouille contre les envois CI suivants. */
export async function setChangelogAction(
  input: Target & { body: string },
): Promise<{ ok: true } | ActionFailure> {
  const auth = await requireWriter();
  if (!auth.ok) return auth.res;

  // Même borne que l'ingest, même helper : une note saisie à la main et une note
  // envoyée par la CI ne doivent pas avoir deux limites différentes.
  const parsed = changelogStr.safeParse(input.body);
  if (!parsed.success || !parsed.data) return fail("err.changelogBody");

  const svc = await getServiceBySlug(input.company, input.product, input.service);
  if (!svc) return fail("err.serviceNotFound");

  await setManualChangelog(svc.id, input.version, parsed.data, auth.session.name);
  await recordAudit({ action: "changelog.set", actor: auth.session.name, target: targetLabel(input) });
  revalidatePath(input.path);
  return { ok: true };
}

/** Rend la version à la CI : le prochain déploiement réécrira la note. */
export async function releaseChangelogAction(input: Target): Promise<{ ok: true } | ActionFailure> {
  const auth = await requireWriter();
  if (!auth.ok) return auth.res;

  const svc = await getServiceBySlug(input.company, input.product, input.service);
  if (!svc) return fail("err.serviceNotFound");

  await releaseChangelogToCi(svc.id, input.version);
  await recordAudit({ action: "changelog.release", actor: auth.session.name, target: targetLabel(input) });
  revalidatePath(input.path);
  return { ok: true };
}
