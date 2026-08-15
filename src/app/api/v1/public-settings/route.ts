import { requireAdmin } from "@/lib/auth/guard";
import { getPublicEventTypes, setPublicEventTypes } from "@/lib/visibility";

export async function GET() {
  return Response.json({ eventTypes: await getPublicEventTypes() });
}

export async function PUT(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.eventTypes) || !body.eventTypes.every((t: unknown) => typeof t === "string")) {
    return Response.json({ error: "eventTypes must be an array of strings" }, { status: 400 });
  }
  await setPublicEventTypes(body.eventTypes);
  return Response.json({ eventTypes: await getPublicEventTypes() }, { status: 200 });
}
