import { readSessionFromCookieHeader } from "./session";
import type { Role } from "./roles";

export async function requireSessionRole(req: Request, role: Role): Promise<Response | null> {
  const s = await readSessionFromCookieHeader(req.headers.get("cookie"));
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!s.roles.includes(role)) return Response.json({ error: "forbidden" }, { status: 403 });
  return null;
}

export function requireAdmin(req: Request): Promise<Response | null> {
  return requireSessionRole(req, "admin");
}
