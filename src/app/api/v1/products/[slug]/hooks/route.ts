import { requireAdmin } from "@/lib/auth/guard";
import { getProductBySlug } from "@/lib/hierarchy";
import { listHooks, createHook } from "@/lib/hooks/config";
import { getConnector } from "@/lib/hooks/registry";
import { getTarget } from "@/lib/notificationTarget";
import { checkConfiguredOutboundUrl } from "@/lib/outboundUrl";
import { auditRequest } from "@/lib/audit";
import "@/lib/hooks";

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

// Admin-only: hook config carries webhook URLs and custom auth headers.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const r = await resolve(req, slug);
  if (r.error) return r.error;
  return Response.json(await listHooks(r.product.id));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { slug } = await params;
  const r = await resolve(req, slug);
  if (r.error) return r.error;
  const body = await req.json().catch(() => null);
  const type = body && typeof body.type === "string" ? body.type : "";
  const url = body && typeof body.url === "string" ? body.url.trim() : "";
  const configObj = body && body.config && typeof body.config === "object" && !Array.isArray(body.config)
    ? (body.config as Record<string, unknown>)
    : null;
  const targetId = body && typeof body.targetId === "string" ? body.targetId : "";
  if (!getConnector(type)) return Response.json({ error: "unknown connector type" }, { status: 400 });
  const events = Array.isArray(body.events) && body.events.every((e: unknown) => typeof e === "string") ? body.events : ["*"];
  const transitions = Array.isArray(body.transitions) && body.transitions.every((t: unknown) => typeof t === "string") ? body.transitions : [];
  if (targetId) {
    const target = await getTarget(targetId);
    if (!target) return Response.json({ error: "unknown target" }, { status: 400 });
    if (target.type !== type) return Response.json({ error: "target type mismatch" }, { status: 400 });
    const hook = await createHook({ productId: r.product.id, type, events, transitions, config: {}, targetId, enabled: body.enabled !== false });
    await auditRequest(req, { action: "hook.created", target: hook.id, detail: { product: slug, type, targetId, events } });
    return Response.json(hook, { status: 201 });
  }
  if (!configObj && !url) return Response.json({ error: "config or url is required" }, { status: 400 });
  const config = configObj ?? { url };
  // Same policy as notification targets: refuse an unreachable-by-policy url up
  // front instead of logging a failed delivery per event.
  const target = typeof config.url === "string" ? config.url.trim() : "";
  if (target) {
    const checked = checkConfiguredOutboundUrl(target);
    if (!checked.ok) return Response.json({ error: checked.reason }, { status: 400 });
  }
  const hook = await createHook({ productId: r.product.id, type, events, transitions, config, enabled: body.enabled !== false });
  // The host, not the full url: query strings in webhook urls are often the token.
  await auditRequest(req, { action: "hook.created", target: hook.id, detail: { product: slug, type, events, host: hostOf(target) } });
  return Response.json(hook, { status: 201 });
}
