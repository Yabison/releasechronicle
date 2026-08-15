import { after } from "next/server";
import { requireWriteToken } from "@/lib/auth";
import { getServiceBySlug } from "@/lib/hierarchy";
import { getActiveEnvSlugs } from "@/lib/environment";
import { reportRuntimeBuild } from "@/lib/runtimeDrift";
import { emitHooks } from "@/lib/hooks/dispatch";
import "@/lib/hooks";

/** A server agent reports the build actually running (service+env). Compares to the last
 *  DEPLOYED build; opens/resolves a BUILD_DRIFT incident. Write-token guarded. */
export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const company = body && typeof body.company === "string" ? body.company : "";
  const product = body && typeof body.product === "string" ? body.product : "";
  const service = body && typeof body.service === "string" ? body.service : "";
  const environment = body && typeof body.environment === "string" ? body.environment : "";
  const build = body && typeof body.build === "string" ? body.build.trim() : "";
  if (!company || !product || !service || !environment || !build) {
    return Response.json({ error: "company, product, service, environment and build are required" }, { status: 400 });
  }
  if (!(await getActiveEnvSlugs()).includes(environment)) {
    return Response.json({ error: "unknown environment" }, { status: 400 });
  }
  const svc = await getServiceBySlug(company, product, service);
  if (!svc) return Response.json({ error: "service not found" }, { status: 404 });

  const result = await reportRuntimeBuild({ serviceId: svc.id, environment, build });
  if (result.drift && result.incidentId) {
    const id = result.incidentId;
    try { after(() => emitHooks(id, "incident.created")); } catch { void emitHooks(id, "incident.created"); }
  }
  return Response.json(result, { status: 200 });
}
