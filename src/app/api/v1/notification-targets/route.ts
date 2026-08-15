import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { listTargets, createTarget, validateTargetConfig } from "@/lib/notificationTarget";

// Admin-only: target config carries webhook URLs and SMTP recipients.
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await listTargets());
}
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const type = body && typeof body.type === "string" ? body.type : "";
  const label = body && typeof body.label === "string" ? body.label.trim() : "";
  const config = body && body.config && typeof body.config === "object" ? (body.config as Record<string, unknown>) : {};
  if (!label) return Response.json({ error: "label is required" }, { status: 400 });
  const err = validateTargetConfig(type, config);
  if (err) return Response.json({ error: err }, { status: 400 });
  const created = await createTarget({ type, label, config });
  // Type and label only: the config is the credential.
  await auditRequest(req, { action: "notificationTarget.created", target: created.id, detail: { type, label } });
  return Response.json(created, { status: 201 });
}
