import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { createIngestSource, listGlobalIngestSources } from "@/lib/ingestSource";
import { getActiveEnvSlugs } from "@/lib/environment";

// Admin-only: the rows carry the plaintext CI write token.
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await listGlobalIngestSources());
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const label = body && typeof body.label === "string" ? body.label.trim() : "";
  const env = body && typeof body.defaultEnvironment === "string" ? body.defaultEnvironment : "";
  if (!label) return Response.json({ error: "label is required" }, { status: 400 });
  const ENVS = await getActiveEnvSlugs();
  if (env !== "ALL" && !ENVS.includes(env)) return Response.json({ error: "valid defaultEnvironment (or ALL) is required" }, { status: 400 });
  const source = await createIngestSource({ scope: "GLOBAL", label, defaultEnvironment: env === "ALL" ? null : env });
  // `label`, never `token`: the trail must not become a second place the secret lives.
  await auditRequest(req, { action: "ingestSource.created", target: source.id, detail: { scope: "GLOBAL", label } });
  return Response.json(source, { status: 201 });
}
