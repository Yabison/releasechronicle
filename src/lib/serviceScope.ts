import { getServiceBySlug } from "@/lib/hierarchy";

/** Resolve a service from the `?company=&product=` query + path slug. Returns the service or a Response error. */
export async function resolveServiceFromQuery(
  req: Request,
  serviceSlug: string,
): Promise<{ ok: true; service: { id: string } } | { ok: false; res: Response }> {
  const url = new URL(req.url);
  const company = url.searchParams.get("company");
  const product = url.searchParams.get("product");
  if (!company || !product) {
    return { ok: false, res: Response.json({ error: "company and product query params are required" }, { status: 400 }) };
  }
  const service = await getServiceBySlug(company, product, serviceSlug);
  if (!service) return { ok: false, res: Response.json({ error: "service not found" }, { status: 404 }) };
  return { ok: true, service };
}
