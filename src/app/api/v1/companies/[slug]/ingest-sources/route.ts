import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getCompanyBySlug } from "@/lib/hierarchy";
import { createIngestSource, listCompanyIngestSources } from "@/lib/ingestSource";
import { getActiveEnvSlugs } from "@/lib/environment";

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
  const body = await req.json().catch(() => null);
  const label = body && typeof body.label === "string" ? body.label.trim() : "";
  const env = body && typeof body.defaultEnvironment === "string" ? body.defaultEnvironment : "";
  if (!label) return Response.json({ error: "label is required" }, { status: 400 });
  const ENVS = await getActiveEnvSlugs();
  if (env !== "ALL" && !ENVS.includes(env)) return Response.json({ error: "valid defaultEnvironment (or ALL) is required" }, { status: 400 });
  const source = await createIngestSource({ scope: "COMPANY", companyId: company.id, label, defaultEnvironment: env === "ALL" ? null : env });
  await auditRequest(req, { action: "ingestSource.created", target: source.id, detail: { scope: "COMPANY", company: slug, label } });
  return Response.json(source, { status: 201 });
}
