import { requireWriteToken } from "@/lib/auth";
import { maintenanceBodySchema } from "@/lib/schemas/event";
import { parseBody } from "@/lib/schemas/parse";
import { persistValidated } from "@/lib/ingest";

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const parsed = await parseBody(req, maintenanceBodySchema);
  if (!parsed.ok) return parsed.res;
  return persistValidated("MAINTENANCE", parsed.value);
}
