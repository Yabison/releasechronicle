import { describe, it, expect, beforeAll } from "vitest";
import { ldapProvider } from "@/lib/auth/ldapProvider";

beforeAll(() => {
  process.env.LDAP_URL = "ldap://localhost:1389";
  process.env.LDAP_BASE_DN = "dc=example,dc=org";
  process.env.LDAP_BIND_DN = "cn=admin,dc=example,dc=org";
  process.env.LDAP_BIND_PASSWORD = "adminpassword";
});

/**
 * Accounts come from tests/fixtures/ldap/fixture.ldif: one per role, password equal
 * to the username. What is checked here is the group -> role mapping of
 * config/ldap.yml resolving against a real directory.
 */
describe("ldapProvider (integration, needs the ldap container)", () => {
  it("authenticates qa → qa, plus the baseline viewer", async () => {
    const u = await ldapProvider.authenticate("qa", "qa");
    expect(u).not.toBeNull();
    expect(u!.sub).toBe("qa");
    expect(u!.name).toBe("QA");
    expect(u!.roles.sort()).toEqual(["qa", "viewer"]);
  });
  it("devops → devops + viewer", async () => {
    const u = await ldapProvider.authenticate("devops", "devops");
    expect(u!.roles.sort()).toEqual(["devops", "viewer"]);
  });
  it("admin → every role, from its three group memberships", async () => {
    const u = await ldapProvider.authenticate("admin", "admin");
    expect(u!.roles.sort()).toEqual(["admin", "devops", "qa", "viewer"]);
  });
  it("viewer → the everyone group alone", async () => {
    const u = await ldapProvider.authenticate("viewer", "viewer");
    expect(u!.roles).toEqual(["viewer"]);
  });
  it("wrong password → null", async () => {
    expect(await ldapProvider.authenticate("qa", "nope")).toBeNull();
  });
  it("unknown user → null", async () => {
    expect(await ldapProvider.authenticate("ghost", "x")).toBeNull();
  });
});
