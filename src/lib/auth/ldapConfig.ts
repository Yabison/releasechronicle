import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export type LdapConfig = {
  url: string; baseDN: string; bindDN: string; bindPassword: string;
  userSearchFilter: string; nameAttr: string; emailAttr: string;
  groupSearchFilter: string; groupNameAttr: string; groupRoles: Record<string, string>;
  userListFilter: string; usernameAttr: string;
};

function configFile(): string {
  return process.env.LDAP_CONFIG_FILE ?? join(process.cwd(), "config", "ldap.yml");
}

/** Merge env (connection/secret) + config/ldap.yml (filters/mapping). Null if required env missing/unusable. */
/** Whether LDAP is configured, and its server host:port (never the URL scheme or secret). */
export function ldapServerInfo(): { configured: boolean; server: string | null } {
  const cfg = loadLdapConfig();
  if (!cfg) return { configured: false, server: null };
  let server: string;
  try { server = new URL(cfg.url).host; } catch { server = cfg.url; }
  return { configured: true, server };
}

export function loadLdapConfig(): LdapConfig | null {
  const url = process.env.LDAP_URL, baseDN = process.env.LDAP_BASE_DN;
  const bindDN = process.env.LDAP_BIND_DN, bindPassword = process.env.LDAP_BIND_PASSWORD;
  if (!url || !baseDN || !bindDN || !bindPassword) return null;
  let y: Record<string, unknown> = {};
  try { y = (parse(readFileSync(configFile(), "utf8")) ?? {}) as Record<string, unknown>; } catch { return null; }
  const gr = (y.groupRoles && typeof y.groupRoles === "object" ? y.groupRoles : {}) as Record<string, string>;
  return {
    url, baseDN, bindDN, bindPassword,
    userSearchFilter: String(y.userSearchFilter ?? "(uid={username})"),
    nameAttr: String(y.nameAttr ?? "cn"),
    emailAttr: String(y.emailAttr ?? "mail"),
    groupSearchFilter: String(y.groupSearchFilter ?? "(&(objectClass=groupOfNames)(member={dn}))"),
    groupNameAttr: String(y.groupNameAttr ?? "cn"),
    groupRoles: gr,
    userListFilter: String(y.userListFilter ?? "(objectClass=inetOrgPerson)"),
    usernameAttr: String(y.usernameAttr ?? "uid"),
  };
}
