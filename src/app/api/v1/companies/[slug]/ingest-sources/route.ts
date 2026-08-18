import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getCompanyBySlug } from "@/lib/hierarchy";
import { createIngestSource, listCompanyIngestSources } from "@/lib/ingestSource";
import { getActiveEnvSlugs } from "@/lib/environment";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({
  label: nonEmpty(),
  defaultEnvironment: z.string().catch(""),
});

// Admin-only: the rows carry the plaintext CI write token.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (!company) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(await listCompanyIngestSources(company.id));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const company = await getCompanyBySlug(slug);
  if (!company) return Response.json({ error: "not found" }, { status: 404 });
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  const { label, defaultEnvironment: env } = parsed.value;
  const ENVS = await getActiveEnvSlugs();
  if (env !== "ALL" && !ENVS.includes(env)) return Response.json({ error: "valid defaultEnvironment (or ALL) is required" }, { status: 400 });
  const source = await createIngestSource({ scope: "COMPANY", companyId: company.id, label, defaultEnvironment: env === "ALL" ? null : env });
  await auditRequest(req, { action: "ingestSource.created", target: source.id, detail: { scope: "COMPANY", company: slug, label } });
  return Response.json(source, { status: 201 });
}
