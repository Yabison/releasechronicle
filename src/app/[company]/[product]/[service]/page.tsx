import { notFound } from "next/navigation";
import { getServiceBySlug, getProductBySlug, effectiveEnvWorkflow } from "@/lib/hierarchy";
import { listServiceEvents, countServiceEventsBefore } from "@/lib/events";
import { toClientEvents } from "@/lib/timeline";
import { DetailPane } from "@/components/DetailPane";
import { resolveEnvColorMap, getPublicEnvSlugs } from "@/lib/environment";
import { getSession } from "@/lib/auth/session";
import { canWrite, isAnonymous, isServicePublic, getPublicEventTypes } from "@/lib/visibility";

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
  if (anon) {
    const [publicTypes, publicEnvs] = await Promise.all([getPublicEventTypes(), getPublicEnvSlugs()]);
    const envSet = new Set(publicEnvs);
    events = events.filter((e) => publicTypes.includes(e.type) && envSet.has(e.environment));
  }

  const lots = [...new Set(events.map((e) => e.lot).filter((l): l is string => !!l))];
  const { getLotMembers, lotRollbackWarnings } = await import("@/lib/deployLot");
  const lotMembers = await getLotMembers(lots);
  const lotWarnings = lotRollbackWarnings(lotMembers);

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
    />
  );
}
