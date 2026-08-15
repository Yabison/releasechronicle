import { describe, it, expect, beforeAll } from "vitest";
import { ldapProvider } from "@/lib/auth/ldapProvider";

beforeAll(() => {
  process.env.LDAP_URL = "ldap://localhost:1389";
  process.env.LDAP_BASE_DN = "dc=example,dc=org";
  process.env.LDAP_BIND_DN = "cn=admin,dc=example,dc=org";
  process.env.LDAP_BIND_PASSWORD = "adminpassword";
});

describe("ldapProvider (integration, needs the ldap container)", () => {
  it("authenticates alice → qa", async () => {
    const u = await ldapProvider.authenticate("alice", "alicepw");
    expect(u).not.toBeNull();
    expect(u!.sub).toBe("alice");
    expect(u!.name).toBe("Alice Martin");
    expect(u!.roles).toContain("qa");
  });
  it("carol → devops + qa", async () => {
    const u = await ldapProvider.authenticate("carol", "carolpw");
    expect(u!.roles.sort()).toEqual(["devops", "qa"]);
  });
  it("bob → admin", async () => {
    expect((await ldapProvider.authenticate("bob", "bobpw"))!.roles).toContain("admin");
  });
  it("wrong password → null", async () => {
    expect(await ldapProvider.authenticate("alice", "nope")).toBeNull();
  });
  it("unknown user → null", async () => {
    expect(await ldapProvider.authenticate("ghost", "x")).toBeNull();
  });
});
