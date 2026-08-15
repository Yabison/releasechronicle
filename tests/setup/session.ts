import { signSession } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";

/** A `{ cookie }` headers object carrying a signed session with the given roles. */
export async function sessionCookie(roles: Role[] = ["admin", "devops", "qa"], name = "Tester"): Promise<{ cookie: string }> {
  const token = await signSession({ sub: name.toLowerCase(), name, roles });
  return { cookie: `rc_session=${token}` };
}
