import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { deleteIngestSource } from "@/lib/ingestSource";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  await deleteIngestSource(id).catch(() => null);
  await auditRequest(req, { action: "ingestSource.deleted", target: id });
  return Response.json({ ok: true }, { status: 200 });
}
