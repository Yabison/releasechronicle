import { Client } from "ldapts";
import { loadLdapConfig } from "./ldapConfig";
import { mapGroupsToRoles } from "./ldapRoles";
import type { AuthProvider, AuthUser } from "./provider";

/** Escape a value for use inside an LDAP filter (RFC 4515). */
export function esc(v: string): string {
  return v.replace(/[\\*()\0]/g, (c) => "\\" + c.charCodeAt(0).toString(16).padStart(2, "0"));
}
export function first(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

export const ldapProvider: AuthProvider = {
  async authenticate(username: string, password: string): Promise<AuthUser | null> {
    const cfg = loadLdapConfig();
    if (!cfg || !password) return null;
    const svc = new Client({ url: cfg.url });
    try {
      await svc.bind(cfg.bindDN, cfg.bindPassword);
      const filter = cfg.userSearchFilter.replace(/\{username\}/g, esc(username));
      const { searchEntries } = await svc.search(cfg.baseDN, { scope: "sub", filter, attributes: [cfg.nameAttr, cfg.emailAttr] });
      if (searchEntries.length !== 1) return null;
      const entry = searchEntries[0];
      const userDN = entry.dn;

      const asUser = new Client({ url: cfg.url });
      try { await asUser.bind(userDN, password); } catch { return null; } finally { await asUser.unbind().catch(() => {}); }

      const gfilter = cfg.groupSearchFilter.replace(/\{dn\}/g, esc(userDN));
      const groups = await svc.search(cfg.baseDN, { scope: "sub", filter: gfilter, attributes: [cfg.groupNameAttr] });
      const cns = groups.searchEntries.map((g) => first(g[cfg.groupNameAttr])).filter((x): x is string => !!x);
      const roles = mapGroupsToRoles(cns, cfg.groupRoles);

      return { sub: username, name: first(entry[cfg.nameAttr]) ?? username, email: first(entry[cfg.emailAttr]), roles };
    } catch {
      return null;
    } finally {
      await svc.unbind().catch(() => {});
    }
  },
};
