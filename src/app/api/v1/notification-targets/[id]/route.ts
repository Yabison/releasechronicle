import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { updateTarget, deleteTarget, getTarget, validateTargetConfig } from "@/lib/notificationTarget";
import { isForeignKeyViolation } from "@/lib/http";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const existing = await getTarget(id);
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const data: { label?: string; config?: Record<string, unknown> } = {};
  if (body && typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if (body && body.config && typeof body.config === "object") {
    const err = validateTargetConfig(existing.type, body.config);
    if (err) return Response.json({ error: err }, { status: 400 });
    data.config = body.config as Record<string, unknown>;
  }
  const updated = await updateTarget(id, data);
  await auditRequest(req, { action: "notificationTarget.updated", target: id, detail: { fields: Object.keys(data) } });
  return Response.json(updated, { status: 200 });
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await deleteTarget(id);
    await auditRequest(req, { action: "notificationTarget.deleted", target: id });
    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (isForeignKeyViolation(e)) return Response.json({ error: "cible utilisée par des hooks" }, { status: 409 });
    throw e;
  }
}
