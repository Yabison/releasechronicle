import { z } from "zod";
import { requireWriteToken } from "@/lib/auth";
import { getServiceBySlug } from "@/lib/hierarchy";
import { getActiveEnvSlugs } from "@/lib/environment";
import { reportRuntimeBuild } from "@/lib/runtimeDrift";
import { emitHooks } from "@/lib/hooks/dispatch";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";
import "@/lib/hooks";

// company/product/service are trimmed lookup keys, not stored values: a CI payload
// with incidental whitespace (copy-pasted slug, trailing newline) now resolves instead
// of 404ing.
const postSchema = z.object({
  company: nonEmpty(),
  product: nonEmpty(),
  service: nonEmpty(),
  environment: nonEmpty(),
  build: nonEmpty(),
});

/** A server agent reports the build actually running (service+env). Compares to the last
 *  DEPLOYED build; opens/resolves a BUILD_DRIFT incident. Write-token guarded. */
export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  const { company, product, service, environment, build } = parsed.value;
  if (!(await getActiveEnvSlugs()).includes(environment)) {
    return Response.json({ error: "unknown environment" }, { status: 400 });
  }
  const svc = await getServiceBySlug(company, product, service);
  if (!svc) return Response.json({ error: "service not found" }, { status: 404 });

  const result = await reportRuntimeBuild({ serviceId: svc.id, environment, build });
  if (result.drift && result.incidentId) {
    const id = result.incidentId;
    await emitHooks(id, "incident.created");
  }
  return Response.json(result, { status: 200 });
}
