import { requireAdmin } from "@/lib/auth/guard";
import { ldapServerInfo } from "@/lib/auth/ldapConfig";

/** Admin: whether LDAP is configured + its server host:port (no URL scheme, no secret). */
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(ldapServerInfo());
}
