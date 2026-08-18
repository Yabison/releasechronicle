import { requireAdmin } from "@/lib/auth/guard";
import { getProductBySlug } from "@/lib/hierarchy";
import { getHook, deleteHook } from "@/lib/hooks/config";
import { auditRequest } from "@/lib/audit";

async function resolve(req: Request, slug: string) {
  const company = new URL(req.url).searchParams.get("company");
  if (!company) return { error: Response.json({ error: "company query param is required" }, { status: 400 }) };
  const product = await getProductBySlug(company, slug);
  if (!product) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  return { product };
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; hookId: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug, hookId } = await params;
  const r = await resolve(req, slug);
  if (r.error) return r.error;
  // The [slug] segment used to be decorative: this checks the hook actually
  // belongs to the resolved product before deleting it.
  const hook = await getHook(hookId);
  if (!hook || hook.productId !== r.product.id) return Response.json({ error: "not found" }, { status: 404 });
  await deleteHook(hookId).catch(() => null);
  await auditRequest(req, { action: "hook.deleted", target: hookId, detail: { product: slug } });
  return Response.json({ ok: true }, { status: 200 });
}
