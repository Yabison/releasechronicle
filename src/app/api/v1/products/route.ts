import { z } from "zod";
import { requireAdmin, isAdminRequest } from "@/lib/auth/guard";
import { createProduct, listProducts, getCompanyBySlug } from "@/lib/hierarchy";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({ companyId: nonEmpty(), name: nonEmpty() });

export async function GET(req: Request) {
  const companySlug = new URL(req.url).searchParams.get("company");
  if (!companySlug) {
    return Response.json({ error: "company query param is required" }, { status: 400 });
  }
  const company = await getCompanyBySlug(companySlug);
  if (!company) return Response.json({ error: "company not found" }, { status: 404 });
  const scope = await requestScope(req);
  // includeDeleted is admin-only; ignored silently for anyone else (see companies/route.ts).
  const includeDeleted =
    new URL(req.url).searchParams.get("includeDeleted") === "1" && (await isAdminRequest(req));
  return Response.json(await listProducts(company.id, scope.anonymous, includeDeleted));
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  try {
    const product = await createProduct({ companyId: parsed.value.companyId, name: parsed.value.name });
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
