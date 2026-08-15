import { requireAdmin } from "@/lib/auth/guard";
import { createProduct, listProducts, getCompanyBySlug } from "@/lib/hierarchy";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";

export async function GET(req: Request) {
  const companySlug = new URL(req.url).searchParams.get("company");
  if (!companySlug) {
    return Response.json({ error: "company query param is required" }, { status: 400 });
  }
  const company = await getCompanyBySlug(companySlug);
  if (!company) return Response.json({ error: "company not found" }, { status: 404 });
  const scope = await requestScope(req);
  return Response.json(await listProducts(company.id, scope.anonymous));
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.companyId !== "string" ||
    typeof body.name !== "string" ||
    body.name.trim() === ""
  ) {
    return Response.json({ error: "companyId and name are required" }, { status: 400 });
  }
  try {
    const product = await createProduct({ companyId: body.companyId, name: body.name.trim() });
    return Response.json(product, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return Response.json({ error: "product already exists" }, { status: 409 });
    }
    if (isForeignKeyViolation(e)) {
      return Response.json({ error: "company not found" }, { status: 400 });
    }
    throw e;
  }
}
