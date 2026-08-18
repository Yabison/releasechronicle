import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { getProductBySlug } from "@/lib/hierarchy";
import { getHook, updateHook, deleteHook } from "@/lib/hooks/config";
import { getTarget } from "@/lib/notificationTarget";
import { checkConfiguredOutboundUrl } from "@/lib/outboundUrl";
import { auditRequest } from "@/lib/audit";
import { parseBody } from "@/lib/schemas/parse";

const putSchema = z.object({
  type: z.unknown().optional(), // not updatable; accepted and ignored rather than 400ing
  events: z.array(z.string()).optional(),
  transitions: z.array(z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  targetId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

const hostOf = (raw: string): string | null => {
  try { return new URL(raw).host; } catch { return null; }
};

async function resolve(req: Request, slug: string) {
  const company = new URL(req.url).searchParams.get("company");
  if (!company) return { error: Response.json({ error: "company query param is required" }, { status: 400 }) };
  const product = await getProductBySlug(company, slug);
  if (!product) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  return { product };
}

function isEmptyConfig(config: unknown): boolean {
  return !config || typeof config !== "object" || Array.isArray(config) || Object.keys(config).length === 0;
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string; hookId: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug, hookId } = await params;
  const r = await resolve(req, slug);
  if (r.error) return r.error;
  const hook = await getHook(hookId);
  if (!hook || hook.productId !== r.product.id) return Response.json({ error: "not found" }, { status: 404 });

  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.res;
  const { events, transitions, config: configObj, targetId, enabled } = parsed.value;
  // JSON has no `undefined`, so a key that's absent from the body parses to
  // `undefined` and a key sent as `null` parses to `null` — no need to
  // separately track "was this key present".
  const hasConfig = configObj !== undefined;

  const data: Parameters<typeof updateHook>[1] = {};
  if (events !== undefined) data.events = events;
  if (transitions !== undefined) data.transitions = transitions;
  if (enabled !== undefined) data.enabled = enabled;

  let host: string | null = null;

  if (targetId !== undefined && targetId !== null) {
    // Attaching / re-pointing to a target: same invariant as POST — target type
    // must match the hook's own type, and config is then owned by the target.
    const target = await getTarget(targetId);
    if (!target) return Response.json({ error: "unknown target" }, { status: 400 });
    if (target.type !== hook.type) return Response.json({ error: "target type mismatch" }, { status: 400 });
    data.targetId = targetId;
    data.config = {};
  } else {
    const detaching = targetId === null;
    if (detaching) data.targetId = null;

    const willHaveNoTarget = detaching || !hook.targetId;
    if (hasConfig) {
      if (willHaveNoTarget) {
        // Same policy as notification targets/POST: refuse an unreachable-by-policy
        // url up front instead of logging a failed delivery per event.
        const url = configObj && typeof configObj.url === "string" ? configObj.url.trim() : "";
        if (url) {
          const checked = checkConfiguredOutboundUrl(url);
          if (!checked.ok) return Response.json({ error: checked.reason }, { status: 400 });
          host = hostOf(url);
        }
      }
      data.config = configObj as Record<string, unknown>;
    }

    if (detaching) {
      // Detached hooks rely on their own config; make sure one exists post-update.
      const resultingConfig = hasConfig ? configObj : hook.config;
      if (isEmptyConfig(resultingConfig)) {
        return Response.json({ error: "config is required when detaching a target" }, { status: 400 });
      }
    }
  }

  const updated = await updateHook(hookId, data);
  // Log which fields changed and the host (never the full url or the config itself).
  await auditRequest(req, {
    action: "hook.updated",
    target: hookId,
    detail: { product: slug, fields: Object.keys(data), ...(host ? { host } : {}) },
  });
  return Response.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; hookId: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug, hookId } = await params;
  const r = await resolve(req, slug);
  if (r.error) return r.error;
  // The [slug] segment used to be decorative: this checks the hook actually
  // belongs to the resolved product before deleting it.
  const hook = await getHook(hookId);
  if (!hook || hook.productId !== r.product.id) return Response.json({ error: "not found" }, { status: 404 });
  await deleteHook(hookId).catch(() => null);
  await auditRequest(req, { action: "hook.deleted", target: hookId, detail: { product: slug } });
  return Response.json({ ok: true }, { status: 200 });
}
