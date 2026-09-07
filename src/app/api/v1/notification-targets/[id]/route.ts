import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { updateTarget, deleteTarget, getTarget, validateTargetConfig } from "@/lib/notificationTarget";
import { isForeignKeyViolation } from "@/lib/http";
import { nonEmpty, ignoredIfInvalid } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const putSchema = z.object({
  label: ignoredIfInvalid(nonEmpty()),
  // Old code: `body.config && typeof body.config === "object"` — a non-object
  // (string/number/boolean/null) config is silently ignored, not rejected.
  config: z.preprocess(
    (v) => (v && typeof v === "object" ? v : undefined),
    z.record(z.string(), z.unknown()).optional(),
  ),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const existing = await getTarget(id);
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;
  const data: { label?: string; config?: Record<string, unknown> } = {};
  if (parsed.value.label !== undefined) data.label = parsed.value.label;
  if (parsed.value.config !== undefined) {
    const err = validateTargetConfig(existing.type, parsed.value.config);
    if (err) return Response.json({ error: err }, { status: 400 });
    data.config = parsed.value.config;
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
