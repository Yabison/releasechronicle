import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { syncLdapUsers } from "@/lib/auth/ldapSync";

beforeAll(() => {
  process.env.LDAP_URL = "ldap://localhost:1389";
  process.env.LDAP_BASE_DN = "dc=example,dc=org";
  process.env.LDAP_BIND_DN = "cn=admin,dc=example,dc=org";
  process.env.LDAP_BIND_PASSWORD = "adminpassword";
});
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("syncLdapUsers (integration, needs the ldap container)", () => {
  it("mirrors AD users with computed roles", async () => {
    const r = await syncLdapUsers();
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(4);
    const byName = Object.fromEntries((await prisma.directoryUser.findMany()).map((u) => [u.username, u]));
    expect(byName.alice.roles).toEqual(["qa"]);
    expect(byName.bob.roles).toEqual(["admin"]);
    expect(byName.admin.roles).toEqual(["admin"]);
    expect([...byName.carol.roles].sort()).toEqual(["devops", "qa"]);
    expect(byName.alice.name).toBe("Alice Martin");
  });
  it("is idempotent and removes departed users", async () => {
    await prisma.directoryUser.create({ data: { username: "ghost", name: "Ghost", roles: ["viewer"] } });
    const r = await syncLdapUsers();
    expect(r.synced).toBe(4);
    expect(await prisma.directoryUser.count()).toBe(4);
    expect(await prisma.directoryUser.findUnique({ where: { username: "ghost" } })).toBeNull();
  });
});
