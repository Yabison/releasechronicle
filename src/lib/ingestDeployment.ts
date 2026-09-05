import type { Event, IngestSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createEvent, type EventData } from "@/lib/events";
import { upsertChangelogFromCi } from "@/lib/changelog";
import { getServiceBySlug } from "@/lib/hierarchy";
import { log } from "@/lib/log";
import { ciDeploymentBodySchema } from "@/lib/schemas/ciDeployment";
import { zodErrorMessage } from "@/lib/schemas/parse";

type Fail = { ok: false; status: number; error: string };
type Ok = { ok: true; event: Event };

type SourceWithCompany = {
  scope: "SERVICE" | "COMPANY" | "GLOBAL";
  serviceId: string | null;
  defaultEnvironment: string | null;
  company?: { slug: string } | null;
};

type IngestSlugs = { company?: string; product?: string; service?: string };

/** Resolve the target service id for a deployment given the source scope and body. */
async function resolveIngestServiceId(
  source: SourceWithCompany,
  b: IngestSlugs,
): Promise<{ ok: true; serviceId: string } | { ok: false; status: number; error: string }> {
  if (source.scope === "SERVICE") {
    if (!source.serviceId) return { ok: false, status: 400, error: "source has no service" };
    // findIngestSourceByToken already refuses a token whose service is deleted, but
    // resolveIngestServiceId is also reachable with a source fetched another way
    // (e.g. tests, or a future caller) — re-check here so this branch never hands
    // back a dead service id on its own. Same 404/"service not found" shape as the
    // COMPANY/GLOBAL branches below use for an unresolvable service.
    const svc = await prisma.service.findFirst({ where: { id: source.serviceId, deletedAt: null }, select: { id: true } });
    if (!svc) return { ok: false, status: 404, error: "service not found" };
    return { ok: true, serviceId: svc.id };
  }
  if (source.scope === "COMPANY") {
    const product = b.product, service = b.service;
    if (!product || !service) return { ok: false, status: 400, error: "product and service are required for a company-scoped token" };
    if (!source.company) return { ok: false, status: 400, error: "source has no company" };
    const svc = await getServiceBySlug(source.company.slug, product, service);
    if (!svc) return { ok: false, status: 404, error: "service not found in this company" };
    return { ok: true, serviceId: svc.id };
  }
  const company = b.company, product = b.product, service = b.service;
  if (!company || !product || !service) return { ok: false, status: 400, error: "company, product and service are required for a global token" };
  const svc = await getServiceBySlug(company, product, service);
  if (!svc) return { ok: false, status: 404, error: "service not found" };
  return { ok: true, serviceId: svc.id };
}

/** Validate a generic ingest payload against a source and create the deployment. */
export async function ingestDeployment(
  source: IngestSource & { company?: { slug: string } | null },
  body: unknown,
): Promise<Ok | Fail> {
  const parsed = ciDeploymentBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: zodErrorMessage(parsed.error) };
  const b = parsed.data;

  const resolved = await resolveIngestServiceId(source as SourceWithCompany, b);
  if (!resolved.ok) return { ok: false, status: resolved.status, error: resolved.error };

  const environment = b.environment ?? source.defaultEnvironment ?? "";
  if (!environment) return { ok: false, status: 400, error: "environment is required (source has no default environment)" };
  const { getActiveEnvSlugs } = await import("@/lib/environment");
  if (!(await getActiveEnvSlugs()).includes(environment)) return { ok: false, status: 400, error: `unknown environment: ${environment}` };

  const data: EventData = {
    serviceId: resolved.serviceId,
    environment,
    type: "DEPLOYMENT",
    occurredAt: new Date(),
    tags: [],
    fields: parsed.data.fields,
  };
  // Meme raison que dans ingest.ts : l'evenement et sa note tombent ensemble.
  const event = await prisma.$transaction(async (tx) => {
    const created = await createEvent(data, tx);
    if (b.changelog && b.version) {
      await upsertChangelogFromCi(resolved.serviceId, b.version, b.changelog, tx);
    }
    return created;
  });
  try {
    const { attachToAutoLot } = await import("@/lib/autoLot");
    await attachToAutoLot(event.id);
    const { detectRollbackOnIngest } = await import("@/lib/rollbackDetect");
    await detectRollbackOnIngest(event.id);
  } catch (e) {
    // Never break the ingest for enrichment — but never hide the failure either.
    log.error("ingest enrichment failed", { mod: "ingest", eventId: event.id, err: e });
  }
  return { ok: true, event };
}
