import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getServiceBySlug, moveService, updateService, SlugConflictError, InvalidParentError } from "@/lib/hierarchy";
import { deleteService, HierarchyNotFoundError, HierarchyStateConflictError } from "@/lib/hierarchyDelete";
import { optionalStr, ignoredIfInvalid } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const putSchema = z.object({
  productId: ignoredIfInvalid(optionalStr()),
  buildUrlTemplate: ignoredIfInvalid(z.string()),
  isMaster: ignoredIfInvalid(z.boolean()),
  public: ignoredIfInvalid(z.boolean()),
  sortOrder: ignoredIfInvalid(z.number().int()),
  envWorkflowOverride: ignoredIfInvalid(z.boolean()),
  envWorkflow: z.array(z.string()).optional(),
});

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
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;

  // Move under a different product when productId is given.
  if (parsed.value.productId) {
    try {
      const moved = await moveService(service.id, parsed.value.productId);
      if (!moved) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(moved, { status: 200 });
    } catch (e) {
      if (e instanceof SlugConflictError) {
        return Response.json({ error: e.message }, { status: 409 });
      }
      if (e instanceof InvalidParentError) {
        return Response.json({ error: e.message }, { status: 409 });
      }
      throw e;
    }
  }

  // Otherwise update editable fields (build-URL template, master flag, env workflow).
  const data: { buildUrlTemplate?: string | null; isMaster?: boolean; envWorkflow?: string[]; envWorkflowOverride?: boolean; sortOrder?: number; public?: boolean } = {};
  if (parsed.value.buildUrlTemplate !== undefined) {
    const raw = parsed.value.buildUrlTemplate.trim();
    data.buildUrlTemplate = raw === "" ? null : raw;
  }
  if (parsed.value.isMaster !== undefined) data.isMaster = parsed.value.isMaster;
  if (parsed.value.public !== undefined) data.public = parsed.value.public;
  if (parsed.value.sortOrder !== undefined) data.sortOrder = parsed.value.sortOrder;
  if (parsed.value.envWorkflowOverride !== undefined) data.envWorkflowOverride = parsed.value.envWorkflowOverride;
  if (parsed.value.envWorkflow !== undefined) {
    const { getActiveEnvSlugs } = await import("@/lib/environment");
    const ENVS = await getActiveEnvSlugs();
    if (!parsed.value.envWorkflow.every((e) => ENVS.includes(e))) {
      return Response.json({ error: "envWorkflow must be an array of valid environments" }, { status: 400 });
    }
    data.envWorkflow = parsed.value.envWorkflow;
  }
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "productId, buildUrlTemplate, isMaster, or envWorkflow is required" }, { status: 400 });
  }
  const updated = await updateService(service.id, data);
  return Response.json(updated, { status: 200 });
}

export async function DELETE(
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
  try {
    const { batch } = await deleteService(service.id);
    await auditRequest(req, {
      action: "service.deleted",
      target: service.id,
      detail: { slug: service.slug, batch },
    });
    return Response.json({}, { status: 200 });
  } catch (e) {
    if (e instanceof HierarchyNotFoundError) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof HierarchyStateConflictError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
