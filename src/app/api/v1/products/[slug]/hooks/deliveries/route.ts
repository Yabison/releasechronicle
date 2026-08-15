import { requireAdmin } from "@/lib/auth/guard";
import { getProductBySlug } from "@/lib/hierarchy";
import { listDeliveries } from "@/lib/hooks/config";

// Admin-only: deliveries store the full outbound payloads.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const company = new URL(req.url).searchParams.get("company");
  if (!company) return Response.json({ error: "company query param is required" }, { status: 400 });
  const product = await getProductBySlug(company, slug);
  if (!product) return Response.json({ error: "not found" }, { status: 404 });
  const u = new URL(req.url);
  const s = (k: string) => { const v = u.searchParams.get(k)?.trim(); return v ? v : undefined; };
  const num = (k: string) => { const v = u.searchParams.get(k); const n = v === null ? NaN : Number(v); return Number.isInteger(n) ? n : undefined; };
  const date = (k: string) => { const v = u.searchParams.get(k); if (!v) return undefined; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; };
  const okParam = u.searchParams.get("ok");
  const limit = Math.min(Math.max(num("limit") ?? 50, 1), 200);
  const offset = Math.max(num("offset") ?? 0, 0);
  const filter = {
    kind: s("kind"), type: s("type"), error: s("error"),
    ok: okParam === "true" ? true : okParam === "false" ? false : undefined,
    statusCode: num("statusCode"),
    from: date("from"), to: date("to"),
    limit, offset,
  };
  return Response.json(await listDeliveries(product.id, filter));
}
