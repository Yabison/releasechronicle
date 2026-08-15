import { currentVersions } from "@/lib/events";
import { resolveServiceFromQuery } from "@/lib/serviceScope";
import { requestScope, denyPrivateService } from "@/lib/apiVisibility";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const resolved = await resolveServiceFromQuery(req, slug);
  if (!resolved.ok) return resolved.res;
  const scope = await requestScope(req);
  const hidden = await denyPrivateService(scope, resolved.service.id);
  if (hidden) return hidden;

  const current = await currentVersions(resolved.service.id);
  if (!scope.anonymous) return Response.json(current);
  // Keyed by environment, so dropping the private ones is enough — a version
  // deployed only to STAGING must not surface here.
  return Response.json(Object.fromEntries(Object.entries(current).filter(([env]) => scope.envs.includes(env))));
}
