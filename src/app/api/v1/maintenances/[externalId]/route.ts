import { requireWriteToken } from "@/lib/auth";
import { maintenanceBodySchema } from "@/lib/schemas/event";
import { parseBody } from "@/lib/schemas/parse";
import { persistValidated } from "@/lib/ingest";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ externalId: string }> },
) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { externalId } = await params;
  const parsed = await parseBody(req, maintenanceBodySchema);
  if (!parsed.ok) return parsed.res;
  return persistValidated("MAINTENANCE", parsed.value, externalId);
}
