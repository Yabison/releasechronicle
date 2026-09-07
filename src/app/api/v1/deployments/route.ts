import { requireWriteToken } from "@/lib/auth";
import { deploymentBodySchema } from "@/lib/schemas/event";
import { parseBody } from "@/lib/schemas/parse";
import { persistValidated } from "@/lib/ingest";

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const parsed = await parseBody(req, deploymentBodySchema);
  if (!parsed.ok) return parsed.res;
  return persistValidated("DEPLOYMENT", parsed.value);
}
