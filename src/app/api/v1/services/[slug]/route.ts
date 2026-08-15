import { requireAdmin } from "@/lib/auth/guard";
import { getServiceBySlug, moveService, updateService, SlugConflictError } from "@/lib/hierarchy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const companySlug = url.searchParams.get("company");
  const productSlug = url.searchParams.get("product");
  if (!companySlug || !productSlug) {
    return Response.json(
      { error: "company and product query params are required" },
      { status: 400 },
    );
  }
  const service = await getServiceBySlug(companySlug, productSlug, slug);
  if (!service) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(service);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const url = new URL(req.url);
  const companySlug = url.searchParams.get("company");
  const productSlug = url.searchParams.get("product");
  if (!companySlug || !productSlug) {
    return Response.json(
      { error: "company and product query params are required" },
      { status: 400 },
    );
  }
  const service = await getServiceBySlug(companySlug, productSlug, slug);
  if (!service) return Response.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => null);

  // Move under a different product when productId is given.
  if (body && typeof body.productId === "string" && body.productId) {
    try {
      const moved = await moveService(service.id, body.productId);
      if (!moved) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(moved, { status: 200 });
    } catch (e) {
      if (e instanceof SlugConflictError) {
        return Response.json({ error: e.message }, { status: 409 });
      }
      throw e;
    }
  }

  // Otherwise update editable fields (build-URL template, master flag, env workflow).
  const data: { buildUrlTemplate?: string | null; isMaster?: boolean; envWorkflow?: string[]; envWorkflowOverride?: boolean; sortOrder?: number; public?: boolean } = {};
  if (typeof body?.buildUrlTemplate === "string") {
    const raw = body.buildUrlTemplate.trim();
    data.buildUrlTemplate = raw === "" ? null : raw;
  }
  if (typeof body?.isMaster === "boolean") data.isMaster = body.isMaster;
  if (typeof body?.public === "boolean") data.public = body.public;
  if (Number.isInteger(body?.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body?.envWorkflowOverride === "boolean") data.envWorkflowOverride = body.envWorkflowOverride;
  if (body && "envWorkflow" in body) {
    const { getActiveEnvSlugs } = await import("@/lib/environment");
    const ENVS = await getActiveEnvSlugs();
    if (!Array.isArray(body.envWorkflow) || !body.envWorkflow.every((e: unknown) => typeof e === "string" && ENVS.includes(e))) {
      return Response.json({ error: "envWorkflow must be an array of valid environments" }, { status: 400 });
    }
    data.envWorkflow = body.envWorkflow as string[];
  }
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "productId, buildUrlTemplate, isMaster, or envWorkflow is required" }, { status: 400 });
  }
  const updated = await updateService(service.id, data);
  return Response.json(updated, { status: 200 });
}
