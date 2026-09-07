import { getServiceBySlug } from "@/lib/hierarchy";
import { listChangelogs } from "@/lib/changelog";
import { canReadChangelog } from "@/lib/visibility";
import { requestScope, denyPrivateService } from "@/lib/apiVisibility";
import { readSessionFromCookieHeader } from "@/lib/auth/session";

const notFound = () => Response.json({ error: "service not found" }, { status: 404 });

/**
 * Notes de release d'un service, la plus récente d'abord.
 *
 * Trois portes dans cet ordre : le service existe, l'appelant a le droit de voir
 * CE service, puis le mode changelog l'autorise. Toujours 404, jamais 403 — dire
 * « ça existe mais c'est privé » est déjà la fuite, comme partout ailleurs ici.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = new URL(req.url);
  const company = u.searchParams.get("company");
  const product = u.searchParams.get("product");
  if (!company || !product) {
    return Response.json({ error: "company and product query params are required" }, { status: 400 });
  }

  const svc = await getServiceBySlug(company, product, slug);
  if (!svc) return notFound();

  const scope = await requestScope(req);
  const denied = await denyPrivateService(scope, svc.id);
  if (denied) return denied;

  const session = await readSessionFromCookieHeader(req.headers.get("cookie"));
  if (!(await canReadChangelog(session))) return notFound();

  return Response.json({ items: await listChangelogs(svc.id) });
}
