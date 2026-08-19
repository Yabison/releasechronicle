import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getServiceBySlugIncludingDeleted } from "@/lib/hierarchy";
import {
  restoreService,
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
  const url = new URL(req.url);
  const companySlug = url.searchParams.get("company");
  const productSlug = url.searchParams.get("product");
  if (!companySlug || !productSlug) {
    return Response.json(
      { error: "company and product query params are required" },
      { status: 400 },
    );
  }
  const service = await getServiceBySlugIncludingDeleted(companySlug, productSlug, slug);
  if (!service) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const counts = await restoreService(service.id);
    await auditRequest(req, {
      action: "service.restored",
      target: service.id,
      detail: { slug: service.slug },
    });
    return Response.json(counts, { status: 200 });
  } catch (e) {
    if (e instanceof HierarchyNotFoundError) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof HierarchyStateConflictError) return Response.json({ error: e.message }, { status: 409 });
    if (e instanceof RestoreBlockedError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
