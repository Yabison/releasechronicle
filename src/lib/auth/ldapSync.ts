import { Client } from "ldapts";
import { prisma } from "@/lib/db";
import { loadLdapConfig } from "./ldapConfig";
import { mapGroupsToRoles } from "./ldapRoles";
import { esc, first } from "./ldapProvider";

export async function syncLdapUsers(): Promise<{ ok: boolean; synced: number; error?: string }> {
  const cfg = loadLdapConfig();
  if (!cfg) return { ok: false, synced: 0, error: "ldap not configured" };
  const svc = new Client({ url: cfg.url });
  try {
    await svc.bind(cfg.bindDN, cfg.bindPassword);
    const { searchEntries } = await svc.search(cfg.baseDN, {
      scope: "sub", filter: cfg.userListFilter,
      attributes: [cfg.usernameAttr, cfg.nameAttr, cfg.emailAttr],
    });
    const seen: string[] = [];
    for (const entry of searchEntries) {
      const username = first(entry[cfg.usernameAttr]);
      if (!username) continue;
      const gfilter = cfg.groupSearchFilter.replace(/\{dn\}/g, esc(entry.dn));
      const groups = await svc.search(cfg.baseDN, { scope: "sub", filter: gfilter, attributes: [cfg.groupNameAttr] });
      const cns = groups.searchEntries.map((g) => first(g[cfg.groupNameAttr])).filter((x): x is string => !!x);
      const roles = mapGroupsToRoles(cns, cfg.groupRoles);
      const name = first(entry[cfg.nameAttr]) ?? username;
      const email = first(entry[cfg.emailAttr]) ?? null;
      await prisma.directoryUser.upsert({
        where: { username },
        create: { username, name, email, roles, syncedAt: new Date() },
        update: { name, email, roles, syncedAt: new Date() },
      });
      seen.push(username);
    }
    await prisma.directoryUser.deleteMany({ where: { username: { notIn: seen } } });
    return { ok: true, synced: seen.length };
  } catch (e) {
    return { ok: false, synced: 0, error: e instanceof Error ? e.message : "sync failed" };
  } finally {
    await svc.unbind().catch(() => {});
  }
}
