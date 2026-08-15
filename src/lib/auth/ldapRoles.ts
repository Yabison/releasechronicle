import { isRole, type Role } from "./roles";

export function mapGroupsToRoles(groupCns: string[], groupRoles: Record<string, string>): Role[] {
  const out = new Set<Role>();
  for (const cn of groupCns) {
    const r = groupRoles[cn];
    if (isRole(r)) out.add(r);
  }
  return [...out];
}
