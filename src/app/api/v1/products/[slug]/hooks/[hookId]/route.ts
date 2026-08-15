import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { deleteHook } from "@/lib/hooks/config";

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; hookId: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug, hookId } = await params;
  await deleteHook(hookId).catch(() => null);
  await auditRequest(req, { action: "hook.deleted", target: hookId, detail: { product: slug } });
  return Response.json({ ok: true }, { status: 200 });
}
