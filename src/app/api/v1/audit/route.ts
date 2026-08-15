import { requireAdmin } from "@/lib/auth/guard";
import { listAuditLog } from "@/lib/audit";

/** Admin-only: the trail names who did what, and from which address. */
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const s = (k: string) => {
    const v = u.searchParams.get(k)?.trim();
    return v ? v : undefined;
  };
  const num = (k: string) => {
    const v = u.searchParams.get(k);
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) ? n : undefined;
  };
  const date = (k: string) => {
    const v = u.searchParams.get(k);
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const okParam = u.searchParams.get("ok");
  return Response.json(
    await listAuditLog({
      action: s("action"),
      actor: s("actor"),
      ok: okParam === "true" ? true : okParam === "false" ? false : undefined,
      from: date("from"),
      to: date("to"),
      limit: num("limit"),
      offset: num("offset"),
    }),
  );
}
