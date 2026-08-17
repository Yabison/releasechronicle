import type { Event, IngestSource } from "@prisma/client";
import { ChangeType, DeployStatus } from "@prisma/client";
import { createEvent, type EventData } from "@/lib/events";
import { getServiceBySlug } from "@/lib/hierarchy";

type Fail = { ok: false; status: number; error: string };
type Ok = { ok: true; event: Event };

const CHANGE = Object.values(ChangeType) as string[];
const STATUS = Object.values(DeployStatus) as string[];

type SourceWithCompany = {
  scope: "SERVICE" | "COMPANY" | "GLOBAL";
  serviceId: string | null;
  defaultEnvironment: string | null;
  company?: { slug: string } | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Resolve the target service id for a deployment given the source scope and body. */
async function resolveIngestServiceId(
  source: SourceWithCompany,
  b: Record<string, unknown>,
): Promise<{ ok: true; serviceId: string } | { ok: false; status: number; error: string }> {
  if (source.scope === "SERVICE") {
    if (!source.serviceId) return { ok: false, status: 400, error: "source has no service" };
    return { ok: true, serviceId: source.serviceId };
  }
  if (source.scope === "COMPANY") {
    const product = str(b.product), service = str(b.service);
    if (!product || !service) return { ok: false, status: 400, error: "product and service are required for a company-scoped token" };
    if (!source.company) return { ok: false, status: 400, error: "source has no company" };
    const svc = await getServiceBySlug(source.company.slug, product, service);
    if (!svc) return { ok: false, status: 404, error: "service not found in this company" };
    return { ok: true, serviceId: svc.id };
  }
  const company = str(b.company), product = str(b.product), service = str(b.service);
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
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  const version = typeof b.version === "string" ? b.version.trim() : "";
  if (!version) return { ok: false, status: 400, error: "version is required" };

  const resolved = await resolveIngestServiceId(source as SourceWithCompany, b);
  if (!resolved.ok) return { ok: false, status: resolved.status, error: resolved.error };

  const environment = b.environment !== undefined ? String(b.environment) : (source.defaultEnvironment ?? "");
  if (!environment) return { ok: false, status: 400, error: "environment is required (source has no default environment)" };
  const { getActiveEnvSlugs } = await import("@/lib/environment");
  if (!(await getActiveEnvSlugs()).includes(environment)) return { ok: false, status: 400, error: `unknown environment: ${environment}` };

  const changeType = b.changeType !== undefined ? String(b.changeType) : "NORMAL";
  if (!CHANGE.includes(changeType)) return { ok: false, status: 400, error: `invalid changeType (${CHANGE.join("|")})` };

  const deployStatus = b.deployStatus !== undefined ? String(b.deployStatus) : "DEPLOYED";
  if (!STATUS.includes(deployStatus)) return { ok: false, status: 400, error: `invalid deployStatus (${STATUS.join("|")})` };

  const requester = typeof b.requester === "string" && b.requester.trim() ? b.requester.trim() : "ci";
  const lot = typeof b.lot === "string" && b.lot.trim() ? b.lot.trim() : version;
  const externalLink = typeof b.externalLink === "string" && b.externalLink.trim() ? b.externalLink.trim() : null;
  const comment = typeof b.comment === "string" && b.comment.trim() ? b.comment.trim() : null;

  let scheduledAt: Date | null = null;
  if (b.scheduledAt !== undefined && b.scheduledAt !== null) {
    const d = new Date(b.scheduledAt as string);
    if (Number.isNaN(d.getTime())) return { ok: false, status: 400, error: "scheduledAt is not a valid date" };
    scheduledAt = d;
  }
  if (deployStatus === "SCHEDULED" && scheduledAt === null) {
    return { ok: false, status: 400, error: "scheduledAt is required when deployStatus is SCHEDULED" };
  }

  const data: EventData = {
    serviceId: resolved.serviceId,
    environment,
    type: "DEPLOYMENT",
    occurredAt: new Date(),
    tags: [],
    fields: { version, requester, changeType, deployStatus, externalLink, lot, comment, scheduledAt },
  };
  const event = await createEvent(data);
  try {
    const { attachToAutoLot } = await import("@/lib/autoLot");
    await attachToAutoLot(event.id);
    const { detectRollbackOnIngest } = await import("@/lib/rollbackDetect");
    await detectRollbackOnIngest(event.id);
  } catch (e) {
    // Never break the ingest for enrichment — but never hide the failure either.
    console.error(`ingest enrichment failed for event ${event.id}:`, e);
  }
  return { ok: true, event };
}
