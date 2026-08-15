import type { Role } from "./roles";
import { localProvider } from "./localProvider";
import { ldapProvider } from "./ldapProvider";

export type AuthUser = { sub: string; name: string; email?: string; roles: Role[] };
export interface AuthProvider { authenticate(username: string, password: string): Promise<AuthUser | null>; }

/** Select the active provider. SP2 adds "ldap". */
export function getProvider(): AuthProvider {
  return process.env.AUTH_PROVIDER === "ldap" ? ldapProvider : localProvider;
}
