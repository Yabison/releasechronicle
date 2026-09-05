import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { createIngestSource, listGlobalIngestSources } from "@/lib/ingestSource";
import { getActiveEnvSlugs } from "@/lib/environment";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({
  label: nonEmpty(),
  defaultEnvironment: z.string().catch(""),
});

// Admin-only: the rows carry the plaintext CI write token.
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await listGlobalIngestSources());
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  const { label, defaultEnvironment: env } = parsed.value;
  const ENVS = await getActiveEnvSlugs();
  if (env !== "ALL" && !ENVS.includes(env)) return Response.json({ error: "valid defaultEnvironment (or ALL) is required" }, { status: 400 });
  const source = await createIngestSource({ scope: "GLOBAL", label, defaultEnvironment: env === "ALL" ? null : env });
  // `label`, never `token`: the trail must not become a second place the secret lives.
  await auditRequest(req, { action: "ingestSource.created", target: source.id, detail: { scope: "GLOBAL", label } });
  return Response.json(source, { status: 201 });
}
