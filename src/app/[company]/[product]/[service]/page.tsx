import { notFound } from "next/navigation";
import { getServiceBySlug, getProductBySlug, effectiveEnvWorkflow } from "@/lib/hierarchy";
import { listServiceEvents, countServiceEventsBefore } from "@/lib/events";
import { toClientEvents } from "@/lib/timeline";
import { DetailPane } from "@/components/DetailPane";
import type { CausalInfo } from "@/components/EventDrawer";
import { getCausalSummaries } from "@/lib/causal";
import { publicEventScopeWhere, type Scope } from "@/lib/apiVisibility";
import { resolveEnvColorMap, getPublicEnvSlugs } from "@/lib/environment";
import { getSession } from "@/lib/auth/session";
import { canWrite, isAnonymous, isServicePublic, getPublicEventTypes, canReadChangelog } from "@/lib/visibility";

export const dynamic = "force-dynamic";

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string; product: string; service: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { company, product, service } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  const session = await getSession();
  const anon = isAnonymous(session);
  // Anonymous visitors cannot reach a service that isn't fully public — even by URL.
  if (anon && !(await isServicePublic(company, product, service))) notFound();

  const svc = await getServiceBySlug(company, product, service);
  if (!svc) notFound();
  const prod = await getProductBySlug(company, product);
  const envColors = await resolveEnvColorMap();

  // The date window IS the pagination: only [from, to] is queried and serialized.
  // Absent `from` = the 3-month default; an explicit empty `from=` loads everything.
  const now = new Date();
  const defaultFrom = (() => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  })();
  const fromStr = fromParam === undefined ? defaultFrom : fromParam;
  const from = fromStr ? new Date(fromStr) : undefined;
  // `to` is a date-only input: include the whole final day.
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : undefined;

  const [rows, olderCount] = await Promise.all([
    listServiceEvents(svc.id, { from, to }),
    from ? countServiceEventsBefore(svc.id, from) : Promise.resolve(0),
  ]);
  let events = toClientEvents(rows as unknown as Array<Record<string, unknown>>);
  let scope: Scope = { anonymous: false };
  if (anon) {
    const [publicTypes, publicEnvs] = await Promise.all([getPublicEventTypes(), getPublicEnvSlugs()]);
    const envSet = new Set(publicEnvs);
    events = events.filter((e) => publicTypes.includes(e.type) && envSet.has(e.environment));
    scope = { anonymous: true, types: publicTypes, envs: publicEnvs };
  }

  const lots = [...new Set(events.map((e) => e.lot).filter((l): l is string => !!l))];
  const { getLotMembers, lotRollbackWarnings } = await import("@/lib/deployLot");
  const lotMembers = await getLotMembers(lots);
  const lotWarnings = lotRollbackWarnings(lotMembers);

  // Causal links are deliberately product-wide (a cause may live on a sibling
  // service), so they're resolved against the DB here — not from `events`, which
  // is this service only — and gated by the same public/anonymous visibility rules
  // as the rest of this page, not by session (read-only visitors need this too).
  // Two batched queries cover every event on the page; see getCausalSummaries.
  const causalSummaries = await getCausalSummaries(
    events.map((e) => ({ id: e.id, causedById: e.causedById })),
    publicEventScopeWhere(scope),
  );
  // Les notes des versions presentes a l'ecran, rendues ICI : le Markdown ne
  // traverse pas vers le client, ni le moteur qui l'assainit. Soumis au meme
  // reglage que la page changelog -- un anonyme en mode AUTHENTICATED n'en voit
  // aucune, meme en ouvrant un deploiement qu'il a le droit de lire.
  const changelogHtml: Record<string, string> = {};
  if (await canReadChangelog(session)) {
    const { listChangelogs } = await import("@/lib/changelog");
    const { renderChangelog } = await import("@/lib/changelogRender");
    const onScreen = new Set(
      events.filter((e) => e.type === "DEPLOYMENT" && e.version).map((e) => e.version as string),
    );
    for (const note of await listChangelogs(svc.id)) {
      if (onScreen.has(note.version)) changelogHtml[note.version] = renderChangelog(note.body);
    }
  }

  const causal: Record<string, CausalInfo> = {};
  for (const [id, s] of causalSummaries) {
    causal[id] = {
      causedBy: s.causedBy ? { ...s.causedBy, occurredAt: s.causedBy.occurredAt.toISOString() } : undefined,
      led: s.led.map((l) => ({ ...l, occurredAt: l.occurredAt.toISOString() })),
    };
  }

  return (
    <DetailPane
      company={company}
      product={product}
      service={service}
      serviceName={svc.name}
      productName={prod?.name ?? product}
      path={`/${company}/${product}/${service}`}
      now={now.toISOString()}
      events={events}
      lotMembers={lotMembers}
      lotWarnings={lotWarnings}
      buildUrlTemplate={svc.buildUrlTemplate ?? null}
      envColors={envColors}
      envWorkflow={effectiveEnvWorkflow(svc, prod)}
      canWrite={canWrite(session)}
      defaultFrom={defaultFrom}
      olderCount={olderCount}
      causal={causal}
      changelogHtml={changelogHtml}
    />
  );
}
