export const ROLES = ["admin", "devops", "qa", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}
