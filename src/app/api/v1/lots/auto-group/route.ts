import { requireWriteToken } from "@/lib/auth";
import { sweepAutoLots } from "@/lib/autoLot";

export async function POST(req: Request) {
  const denied = requireWriteToken(req);
  if (denied) return denied;
  return Response.json(await sweepAutoLots(), { status: 200 });
}
