import { describe, it, expect, afterEach } from "vitest";
import { ldapServerInfo } from "@/lib/auth/ldapConfig";

const KEYS = ["LDAP_URL", "LDAP_BASE_DN", "LDAP_BIND_DN", "LDAP_BIND_PASSWORD"] as const;
function clear() { for (const k of KEYS) delete process.env[k]; }

afterEach(clear);

describe("ldapServerInfo", () => {
  it("reports not configured when the LDAP env is missing", () => {
    clear();
    expect(ldapServerInfo()).toEqual({ configured: false, server: null });
  });
  it("reports host:port (no scheme, no secret) when configured", () => {
    process.env.LDAP_URL = "ldap://directory.example.org:389";
    process.env.LDAP_BASE_DN = "dc=example,dc=org";
    process.env.LDAP_BIND_DN = "cn=admin,dc=example,dc=org";
    process.env.LDAP_BIND_PASSWORD = "secret";
    const info = ldapServerInfo();
    expect(info.configured).toBe(true);
    expect(info.server).toBe("directory.example.org:389");
  });
});
