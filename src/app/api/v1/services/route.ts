import { ServiceType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/guard";
import { createService, listServices, getProductBySlug } from "@/lib/hierarchy";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";

const VALID_TYPES = Object.values(ServiceType) as string[];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const companySlug = url.searchParams.get("company");
  const productSlug = url.searchParams.get("product");
  if (!companySlug || !productSlug) {
    return Response.json(
      { error: "company and product query params are required" },
      { status: 400 },
    );
  }
  const product = await getProductBySlug(companySlug, productSlug);
  if (!product) return Response.json({ error: "product not found" }, { status: 404 });
  const scope = await requestScope(req);
  return Response.json(await listServices(product.id, scope.anonymous));
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.productId !== "string" ||
    typeof body.name !== "string" ||
    body.name.trim() === "" ||
    typeof body.type !== "string" ||
    !VALID_TYPES.includes(body.type)
  ) {
    return Response.json(
      { error: "productId, name, and a valid type (APP|COMPONENT|API) are required" },
      { status: 400 },
    );
  }
  try {
    const service = await createService({
      productId: body.productId,
      name: body.name.trim(),
      type: body.type as ServiceType,
    });
    return Response.json(service, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return Response.json({ error: "service already exists" }, { status: 409 });
    }
    if (isForeignKeyViolation(e)) {
      return Response.json({ error: "product not found" }, { status: 400 });
    }
    throw e;
  }
}
