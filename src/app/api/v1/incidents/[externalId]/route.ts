import { requireWriteToken } from "@/lib/auth";
import { incidentBodySchema } from "@/lib/schemas/event";
import { parseBody } from "@/lib/schemas/parse";
import { persistValidated } from "@/lib/ingest";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ externalId: string }> },
) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { externalId } = await params;
  const parsed = await parseBody(req, incidentBodySchema);
  if (!parsed.ok) return parsed.res;
  return persistValidated("INCIDENT", parsed.value, externalId);
}
