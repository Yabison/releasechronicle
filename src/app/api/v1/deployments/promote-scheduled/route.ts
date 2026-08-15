import { requireWriteToken } from "@/lib/auth";
import { promoteScheduledDeployments } from "@/lib/scheduledPromote";

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  const result = await promoteScheduledDeployments();
  return Response.json(result, { status: 200 });
}
