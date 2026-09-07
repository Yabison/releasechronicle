import { EventType } from "@prisma/client";
import { listServiceEventsPage } from "@/lib/events";
import { resolveServiceFromQuery } from "@/lib/serviceScope";
import { getActiveEnvSlugs } from "@/lib/environment";
import { requestScope, denyPrivateService, publicEventWhere } from "@/lib/apiVisibility";
import { decodeEventCursor } from "@/lib/eventCursor";

const EVENT_TYPES = Object.values(EventType) as string[];
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    if (!/^\d+$/.test(limitParam)) {
      return Response.json({ error: "limit must be a positive integer" }, { status: 400 });
    }
    limit = Number(limitParam);
    if (limit < 1 || limit > MAX_LIMIT) {
      return Response.json({ error: `limit must be between 1 and ${MAX_LIMIT}` }, { status: 400 });
    }
  }
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam !== null ? decodeEventCursor(cursorParam) : undefined;
  if (cursor === null) {
    return Response.json({ error: "malformed cursor" }, { status: 400 });
  }

  const parseDate = (name: "from" | "to") => {
    const raw = url.searchParams.get(name);
    if (raw === null || raw === "") return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const from = parseDate("from");
  const to = parseDate("to");
  if (from === null || to === null) {
    return Response.json({ error: "from/to must be ISO 8601 timestamps" }, { status: 400 });
  }

  // Visibility lives in the query itself: post-filtering a cut page would leave
  // holes in anonymous pages and make nextCursor lie about what remains.
  const { items, nextCursor } = await listServiceEventsPage(
    resolved.service.id,
    {
      environment: envParam ?? undefined,
      type: (typeParam as EventType) ?? undefined,
      from,
      to,
      scope: publicEventWhere(scope),
    },
    { limit, cursor },
  );
  return Response.json({ items, nextCursor });
}
