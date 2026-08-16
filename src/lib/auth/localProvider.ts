import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { parse } from "yaml";
import { isRole, type Role } from "./roles";
import type { AuthProvider, AuthUser } from "./provider";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type RawUser = { username?: unknown; name?: unknown; email?: unknown; roles?: unknown; passwordHash?: unknown };

function usersFile(): string {
  return process.env.AUTH_USERS_FILE ?? join(process.cwd(), "config", "auth-users.yml");
}
function loadUsers(): RawUser[] {
  try {
    const parsed = parse(readFileSync(usersFile(), "utf8")) as { users?: unknown };
    return Array.isArray(parsed?.users) ? (parsed.users as RawUser[]) : [];
  } catch {
    return [];
  }
}

/** The configured accounts, without their hashes. Entries missing a username or a
 *  name are dropped, exactly as `authenticate` would refuse them. */
export function listUsers(): { username: string; name: string; roles: Role[] }[] {
  return loadUsers()
    .filter((u) => typeof u.username === "string" && typeof u.name === "string")
    .map((u) => ({
      username: u.username as string,
      name: u.name as string,
      roles: Array.isArray(u.roles) ? (u.roles as unknown[]).filter(isRole) : [],
    }));
}

export const localProvider: AuthProvider = {
  async authenticate(username: string, password: string): Promise<AuthUser | null> {
    const u = loadUsers().find((x) => x.username === username);
    if (!u || typeof u.passwordHash !== "string" || typeof u.name !== "string") return null;
    if (!verifyPassword(password, u.passwordHash)) return null;
    const roles: Role[] = Array.isArray(u.roles) ? (u.roles as unknown[]).filter(isRole) : [];
    return { sub: username, name: u.name, email: typeof u.email === "string" ? u.email : undefined, roles };
  },
};
