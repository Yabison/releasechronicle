import { requireWriteToken } from "@/lib/auth";
import { incidentBodySchema } from "@/lib/schemas/event";
import { parseBody } from "@/lib/schemas/parse";
import { persistValidated } from "@/lib/ingest";

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const parsed = await parseBody(req, incidentBodySchema);
  if (!parsed.ok) return parsed.res;
  return persistValidated("INCIDENT", parsed.value);
}
