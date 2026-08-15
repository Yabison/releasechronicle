import { requireAdmin } from "@/lib/auth/guard";
import { listDirectoryUsers } from "@/lib/directory";

// Admin-only: the list is a ready-made username dictionary for login guessing.
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await listDirectoryUsers());
}
