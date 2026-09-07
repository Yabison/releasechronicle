import { requireWriteToken } from "@/lib/auth";
import { sweepHookDeliveries } from "@/lib/hooks/sweep";

/** Manual/cron trigger for the delivery sweeper — same job the in-process
 *  timer runs every 60s. Mirrors /deployments/promote-scheduled. */
export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  return Response.json(await sweepHookDeliveries());
}
