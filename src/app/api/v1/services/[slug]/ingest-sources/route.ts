import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getServiceBySlug } from "@/lib/hierarchy";
import { createIngestSource, listIngestSources } from "@/lib/ingestSource";
import { getActiveEnvSlugs } from "@/lib/environment";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({
  label: nonEmpty(),
  defaultEnvironment: z.string().catch(""),
});

async function resolve(req: Request, slug: string) {
  const u = new URL(req.url);
  const company = u.searchParams.get("company");
  const product = u.searchParams.get("product");
  if (!company || !product) return { error: Response.json({ error: "company and product query params are required" }, { status: 400 }) };
  const service = await getServiceBySlug(company, product, slug);
  if (!service) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  return { service };
}

// Admin-only: the rows carry the plaintext CI write token.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const r = await resolve(req, slug);
  if (r.error) return r.error;
  return Response.json(await listIngestSources(r.service.id));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const r = await resolve(req, slug);
  if (r.error) return r.error;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  const { label, defaultEnvironment: env } = parsed.value;
  const ENVS = await getActiveEnvSlugs();
  if (env !== "ALL" && !ENVS.includes(env)) return Response.json({ error: "valid defaultEnvironment (or ALL) is required" }, { status: 400 });
  const source = await createIngestSource({ scope: "SERVICE", serviceId: r.service.id, label, defaultEnvironment: env === "ALL" ? null : env });
  await auditRequest(req, { action: "ingestSource.created", target: source.id, detail: { scope: "SERVICE", service: slug, label } });
  return Response.json(source, { status: 201 });
}
