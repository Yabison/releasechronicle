import type { DemoAccount } from "./demoAccounts";

/**
 * Credentials of the local dev directory, shown on the login page so nobody has to
 * go and read an ldif to sign in.
 *
 * The list is a literal rather than an LDAP query because a directory never hands
 * back a password: there is nothing to read it from. It is kept honest by
 * tests/lib/auth/devAccounts.test.ts, which parses tests/fixtures/ldap/fixture.ldif
 * and fails if the two ever disagree.
 *
 * Two conditions gate it. NODE_ENV, because the Docker image runs in production and
 * these accounts do not exist there — same guard as authSecret() and
 * isValidWriteToken(). AUTH_PROVIDER, because they live in the fixture directory:
 * an instance on the local user store would be shown four accounts it cannot
 * authenticate.
 */

/** Password equals username throughout; roles come from the fixture's groups. */
const DEV_ACCOUNTS: DemoAccount[] = [
  { username: "admin", name: "Admin", roles: ["admin", "devops", "qa", "viewer"], password: "admin" },
  { username: "devops", name: "Devops", roles: ["devops", "viewer"], password: "devops" },
  { username: "qa", name: "QA", roles: ["qa", "viewer"], password: "qa" },
  { username: "viewer", name: "Viewer", roles: ["viewer"], password: "viewer" },
];

/** The dev directory's accounts, or null anywhere they would not work. */
export function devAccounts(): DemoAccount[] | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.AUTH_PROVIDER !== "ldap") return null;
  return DEV_ACCOUNTS;
}
