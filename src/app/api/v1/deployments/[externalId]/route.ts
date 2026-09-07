import { requireWriteToken } from "@/lib/auth";
import { deploymentBodySchema } from "@/lib/schemas/event";
import { parseBody } from "@/lib/schemas/parse";
import { persistValidated } from "@/lib/ingest";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ externalId: string }> },
) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const { externalId } = await params;
  const parsed = await parseBody(req, deploymentBodySchema);
  if (!parsed.ok) return parsed.res;
  return persistValidated("DEPLOYMENT", parsed.value, externalId);
}
