import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { getCompanyBySlugIncludingDeleted } from "@/lib/hierarchy";
import {
  restoreCompany,
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
  const company = await getCompanyBySlugIncludingDeleted(slug);
  if (!company) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const counts = await restoreCompany(company.id);
    await auditRequest(req, {
      action: "company.restored",
      target: company.id,
      detail: { slug: company.slug, products: counts.products ?? 0, services: counts.services ?? 0 },
    });
    return Response.json(counts, { status: 200 });
  } catch (e) {
    if (e instanceof HierarchyNotFoundError) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof HierarchyStateConflictError) return Response.json({ error: e.message }, { status: 409 });
    if (e instanceof RestoreBlockedError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
