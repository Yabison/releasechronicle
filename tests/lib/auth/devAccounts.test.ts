import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { devAccounts } from "@/lib/auth/devAccounts";

beforeEach(() => {
  vi.stubEnv("AUTH_PROVIDER", "ldap");
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devAccounts", () => {
  it("advertises one account per role, password equal to username", () => {
    const accounts = devAccounts();

    expect(accounts?.map((a) => a.username)).toEqual(["admin", "devops", "qa", "viewer"]);
    for (const a of accounts!) expect(a.password).toBe(a.username);
  });

  it("gives every account the baseline viewer role", () => {
    for (const a of devAccounts()!) expect(a.roles).toContain("viewer");
  });

  it("stays silent in production, where the fixture directory does not exist", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(devAccounts()).toBeNull();
  });

  it("stays silent when the app is not wired to the fixture directory", () => {
    vi.stubEnv("AUTH_PROVIDER", "local");

    expect(devAccounts()).toBeNull();
  });
});

/**
 * The accounts are a literal in the module — LDAP cannot hand back a password, so the
 * login page has nothing to read them from. That makes drift the real risk: an ldif
 * edited without the module (or the reverse) would advertise credentials that do not
 * work. This reads the fixture and holds the two together.
 */
describe("devAccounts matches the LDAP fixture", () => {
  const ldif = readFileSync(join(process.cwd(), "tests/fixtures/ldap/fixture.ldif"), "utf8");

  /** uid -> password, from the `uid:` / `userPassword:` pairs of each person entry. */
  const fixtureUsers = (): Map<string, string> => {
    const users = new Map<string, string>();
    for (const block of ldif.split(/\n\s*\n/)) {
      const uid = block.match(/^uid: (.+)$/m)?.[1];
      const pw = block.match(/^userPassword: (.+)$/m)?.[1];
      if (uid && pw) users.set(uid.trim(), pw.trim());
    }
    return users;
  };

  /** group cn -> member uids. */
  const fixtureGroups = (): Map<string, string[]> => {
    const groups = new Map<string, string[]>();
    for (const block of ldif.split(/\n\s*\n/)) {
      if (!block.includes("groupOfNames")) continue;
      const cn = block.match(/^cn: (.+)$/m)?.[1]?.trim();
      if (!cn) continue;
      groups.set(cn, [...block.matchAll(/^member: uid=([^,]+),/gm)].map((m) => m[1]));
    }
    return groups;
  };

  it("advertises exactly the accounts the directory holds", () => {
    const accounts = devAccounts()!;
    const users = fixtureUsers();

    expect(accounts.map((a) => a.username).sort()).toEqual([...users.keys()].sort());
    for (const a of accounts) expect(a.password).toBe(users.get(a.username));
  });

  it("advertises the roles the group memberships actually grant", () => {
    // config/ldap.yml maps group -> role.
    const roleOf: Record<string, string> = {
      admins: "admin", "devops-team": "devops", "qa-team": "qa", everyone: "viewer",
    };
    const groups = fixtureGroups();

    for (const a of devAccounts()!) {
      const granted = [...groups.entries()]
        .filter(([, members]) => members.includes(a.username))
        .map(([cn]) => roleOf[cn]);

      expect([...a.roles].sort()).toEqual([...granted].sort());
    }
  });
});
