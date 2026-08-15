import { requireWriteToken } from "@/lib/auth";
import { validateIncidentBody } from "@/lib/eventValidation";
import { persistValidated } from "@/lib/ingest";

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const v = validateIncidentBody(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  return persistValidated("INCIDENT", v.value);
}
