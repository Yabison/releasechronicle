import { getProductBySlug } from "@/lib/hierarchy";

/**
 * Shared by the product-hooks route handlers (`hooks/route.ts` and
 * `hooks/[hookId]/route.ts`): resolve the `?company=` + `[slug]` pair to a
 * product, or the 400/404 Response to return as-is. Kept in one place so the
 * two handlers can't drift on how a product is resolved.
 */
export async function resolveProduct(req: Request, slug: string) {
  const company = new URL(req.url).searchParams.get("company");
  if (!company) return { error: Response.json({ error: "company query param is required" }, { status: 400 }) };
  const product = await getProductBySlug(company, slug);
  if (!product) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  return { product };
}

/** Host-only extraction for audit logs: never the full url (query strings often carry tokens). */
export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}
