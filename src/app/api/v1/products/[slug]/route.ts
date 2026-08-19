import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getProductBySlug, updateProduct, moveProduct, SlugConflictError } from "@/lib/hierarchy";
import { deleteProduct, HierarchyNotFoundError, HierarchyStateConflictError } from "@/lib/hierarchyDelete";
import { getActiveEnvSlugs } from "@/lib/environment";
import { prisma } from "@/lib/db";
import { optionalStr, ignoredIfInvalid } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const putSchema = z.object({
  companyId: ignoredIfInvalid(optionalStr()),
  sortOrder: ignoredIfInvalid(z.number().int()),
  public: ignoredIfInvalid(z.boolean()),
  envWorkflow: z.array(z.string()).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const companySlug = new URL(req.url).searchParams.get("company");
  if (!companySlug) {
    return Response.json({ error: "company query param is required" }, { status: 400 });
  }
  const product = await getProductBySlug(companySlug, slug);
  if (!product) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(product);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const companySlug = new URL(req.url).searchParams.get("company");
  if (!companySlug) {
    return Response.json({ error: "company query param is required" }, { status: 400 });
  }
  const product = await getProductBySlug(companySlug, slug);
  if (!product) return Response.json({ error: "not found" }, { status: 404 });
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;
  if (parsed.value.companyId) {
    try {
      const moved = await moveProduct(product.id, parsed.value.companyId);
      if (!moved) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(moved, { status: 200 });
    } catch (e) {
      if (e instanceof SlugConflictError) {
        return Response.json({ error: e.message }, { status: 409 });
      }
      throw e;
    }
  }
  const data: { envWorkflow?: string[]; sortOrder?: number; public?: boolean } = {};
  if (parsed.value.sortOrder !== undefined) data.sortOrder = parsed.value.sortOrder;
  if (parsed.value.public !== undefined) data.public = parsed.value.public;
  if (parsed.value.envWorkflow !== undefined) {
    const ENVS = await getActiveEnvSlugs();
    if (!parsed.value.envWorkflow.every((e) => ENVS.includes(e))) {
      return Response.json(
        { error: "envWorkflow must be an array of valid environments" },
        { status: 400 },
      );
    }
    data.envWorkflow = parsed.value.envWorkflow;
  }
  const updated = await updateProduct(product.id, data);
  return Response.json(updated, { status: 200 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const companySlug = new URL(req.url).searchParams.get("company");
  if (!companySlug) {
    return Response.json({ error: "company query param is required" }, { status: 400 });
  }
  const product = await getProductBySlug(companySlug, slug);
  if (!product) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const counts = await deleteProduct(product.id);
    const row = await prisma.product.findUnique({ where: { id: product.id }, select: { deletedBatch: true } });
    await auditRequest(req, {
      action: "product.deleted",
      target: product.id,
      detail: { slug: product.slug, services: counts.services, batch: row?.deletedBatch ?? null },
    });
    return Response.json(counts, { status: 200 });
  } catch (e) {
    if (e instanceof HierarchyNotFoundError) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof HierarchyStateConflictError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
