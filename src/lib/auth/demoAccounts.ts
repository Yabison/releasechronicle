import { listUsers } from "./localProvider";
import type { Role } from "./roles";

/**
 * Credentials of the public demo instance, shown on its login page so a visitor
 * can get in without being handed an account.
 *
 * The whole module hangs on one condition: RC_DEMO_MODE. Printing account names
 * and a password on a login page is only ever acceptable on an instance whose
 * credentials are already published — config/auth-users.demo.yml is in the
 * repository — so the flag has to be set deliberately, and `demoAccounts()`
 * returns null everywhere else. Same guard as the seeding jobs use
 * (prisma/demo-guard.ts).
 */

/** Shared by the three demo accounts, and published in the users file. */
export const DEMO_PASSWORD = "demo";

export type DemoAccount = { username: string; name: string; roles: Role[]; password: string };

/** The accounts to advertise, or null on any instance that is not the demo. */
export function demoAccounts(): DemoAccount[] | null {
  if (process.env.RC_DEMO_MODE !== "true") return null;
  const users = listUsers();
  if (users.length === 0) return null;
  return users.map((u) => ({ ...u, password: DEMO_PASSWORD }));
}
