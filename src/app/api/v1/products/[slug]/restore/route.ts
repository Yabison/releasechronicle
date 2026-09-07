import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getProductBySlugIncludingDeleted } from "@/lib/hierarchy";
import {
  restoreProduct,
  HierarchyNotFoundError,
  HierarchyStateConflictError,
  RestoreBlockedError,
} from "@/lib/hierarchyDelete";

export async function POST(
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
  const product = await getProductBySlugIncludingDeleted(companySlug, slug);
  if (!product) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const counts = await restoreProduct(product.id);
    await auditRequest(req, {
      action: "product.restored",
      target: product.id,
      detail: { slug: product.slug, services: counts.services ?? 0 },
    });
    return Response.json(counts, { status: 200 });
  } catch (e) {
    if (e instanceof HierarchyNotFoundError) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof HierarchyStateConflictError) return Response.json({ error: e.message }, { status: 409 });
    if (e instanceof RestoreBlockedError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
