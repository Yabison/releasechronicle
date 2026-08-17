import { z } from "zod";
import { ServiceType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/guard";
import { createService, listServices, getProductBySlug } from "@/lib/hierarchy";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/http";
import { requestScope } from "@/lib/apiVisibility";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({
  productId: nonEmpty(),
  name: nonEmpty(),
  type: z.nativeEnum(ServiceType),
});

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

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  try {
    const service = await createService({
      productId: parsed.value.productId,
      name: parsed.value.name,
      type: parsed.value.type,
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
