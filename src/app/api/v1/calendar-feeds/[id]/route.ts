import { requireAdmin } from "@/lib/auth/guard";
import { deleteCalendarFeed } from "@/lib/calendarFeeds";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  await deleteCalendarFeed(id).catch(() => null);
  return Response.json({ ok: true }, { status: 200 });
}
