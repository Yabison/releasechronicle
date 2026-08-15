import { requireAdmin } from "@/lib/auth/guard";
import { getProductBySlug, updateProduct, moveProduct, SlugConflictError } from "@/lib/hierarchy";
import { getActiveEnvSlugs } from "@/lib/environment";

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
  const body = await req.json().catch(() => null);
  if (body && typeof body.companyId === "string" && body.companyId) {
    try {
      const moved = await moveProduct(product.id, body.companyId);
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
  if (body && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body?.public === "boolean") data.public = body.public;
  if (body && "envWorkflow" in body) {
    const ENVS = await getActiveEnvSlugs();
    if (
      !Array.isArray(body.envWorkflow) ||
      !body.envWorkflow.every((e: unknown) => typeof e === "string" && ENVS.includes(e))
    ) {
      return Response.json(
        { error: "envWorkflow must be an array of valid environments" },
        { status: 400 },
      );
    }
    data.envWorkflow = body.envWorkflow as string[];
  }
  const updated = await updateProduct(product.id, data);
  return Response.json(updated, { status: 200 });
}
