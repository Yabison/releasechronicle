import { requireAdmin } from "@/lib/auth/guard";
import { listCalendarFeeds, createCalendarFeed } from "@/lib/calendarFeeds";

const VALID_TYPES = ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"];

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await listCalendarFeeds());
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  const types = Array.isArray(body?.types) ? body.types.filter((t: unknown) => typeof t === "string" && VALID_TYPES.includes(t)) : [];
  const str = (k: string) => (typeof body?.[k] === "string" && body[k].trim() ? body[k].trim() : null);
  const feed = await createCalendarFeed({
    name, company: str("company"), product: str("product"), service: str("service"), environment: str("environment"), types,
  });
  return Response.json(feed, { status: 201 });
}
