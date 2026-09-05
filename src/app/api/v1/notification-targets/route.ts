import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { auditRequest } from "@/lib/audit";
import { listTargets, createTarget, validateTargetConfig } from "@/lib/notificationTarget";
import { nonEmpty } from "@/lib/schemas/common";
import { parseBody } from "@/lib/schemas/parse";

const postSchema = z.object({
  type: z.string().catch(""),
  label: nonEmpty(),
  config: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.record(z.string(), z.unknown())),
});

// Admin-only: target config carries webhook URLs and SMTP recipients.
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await listTargets());
}
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.res;
  const { type, label, config } = parsed.value;
  const err = validateTargetConfig(type, config);
  if (err) return Response.json({ error: err }, { status: 400 });
  const created = await createTarget({ type, label, config });
  // Type and label only: the config is the credential.
  await auditRequest(req, { action: "notificationTarget.created", target: created.id, detail: { type, label } });
  return Response.json(created, { status: 201 });
}
