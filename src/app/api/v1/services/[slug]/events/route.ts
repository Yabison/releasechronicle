import { EventType } from "@prisma/client";
import { listServiceEvents } from "@/lib/events";
import { resolveServiceFromQuery } from "@/lib/serviceScope";
import { getActiveEnvSlugs } from "@/lib/environment";
import { requestScope, denyPrivateService } from "@/lib/apiVisibility";

const EVENT_TYPES = Object.values(EventType) as string[];

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

  const url = new URL(req.url);
  const envParam = url.searchParams.get("environment");
  const typeParam = url.searchParams.get("type");
  if (envParam !== null && !(await getActiveEnvSlugs()).includes(envParam)) {
    return Response.json({ error: "invalid environment filter" }, { status: 400 });
  }
  if (typeParam !== null && !EVENT_TYPES.includes(typeParam)) {
    return Response.json({ error: "invalid type filter" }, { status: 400 });
  }
  const events = await listServiceEvents(resolved.service.id, {
    environment: envParam ?? undefined,
    type: (typeParam as EventType) ?? undefined,
  });
  if (!scope.anonymous) return Response.json(events);
  const envs = new Set(scope.envs);
  return Response.json(events.filter((e) => scope.types.includes(e.type) && envs.has(e.environment)));
}
