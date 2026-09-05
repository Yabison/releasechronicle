import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { demoAccounts, DEMO_PASSWORD } from "@/lib/auth/demoAccounts";
import { listUsers, localProvider } from "@/lib/auth/localProvider";

const DEMO_FILE = join(process.cwd(), "config", "auth-users.demo.yml");

function asDemoInstance() {
  process.env.RC_DEMO_MODE = "true";
  process.env.AUTH_USERS_FILE = DEMO_FILE;
}

afterEach(() => {
  delete process.env.RC_DEMO_MODE;
  delete process.env.AUTH_USERS_FILE;
});

describe("demoAccounts", () => {
  it("is null on any instance that did not opt in", () => {
    process.env.AUTH_USERS_FILE = DEMO_FILE;
    expect(demoAccounts()).toBeNull();
    process.env.RC_DEMO_MODE = "false";
    expect(demoAccounts()).toBeNull();
    process.env.RC_DEMO_MODE = "1";
    expect(demoAccounts()).toBeNull();
  });

  it("lists the demo accounts with their roles", () => {
    asDemoInstance();
    const accounts = demoAccounts();
    expect(accounts).not.toBeNull();
    expect(accounts!.map((a) => a.username).sort()).toEqual(["demo", "demo-admin", "demo-qa"]);
    expect(accounts!.find((a) => a.username === "demo")!.roles).toEqual(["devops"]);
    expect(accounts!.find((a) => a.username === "demo-qa")!.roles).toEqual(["qa"]);
    expect([...accounts!.find((a) => a.username === "demo-admin")!.roles].sort()).toEqual(["admin", "devops", "qa"]);
  });

  // The point of the page is that a visitor can copy what it shows and get in.
  // This is what stops the advertised password from drifting away from the hashes
  // in config/auth-users.demo.yml.
  it("advertises credentials that actually authenticate", async () => {
    asDemoInstance();
    for (const account of demoAccounts()!) {
      const user = await localProvider.authenticate(account.username, account.password);
      expect(user, `${account.username} / ${account.password} should authenticate`).not.toBeNull();
      expect(user!.roles).toEqual(account.roles);
    }
  });

  it("is empty-safe when the users file is missing", () => {
    process.env.RC_DEMO_MODE = "true";
    process.env.AUTH_USERS_FILE = join(process.cwd(), "config", "does-not-exist.yml");
    expect(demoAccounts()).toBeNull();
  });

  it("uses the published demo password", () => {
    expect(DEMO_PASSWORD).toBe("demo");
  });
});

describe("listUsers", () => {
  it("never returns password hashes", () => {
    process.env.AUTH_USERS_FILE = DEMO_FILE;
    const users = listUsers();
    expect(users.length).toBe(3);
    for (const u of users) {
      expect(Object.keys(u).sort()).toEqual(["name", "roles", "username"]);
      expect(JSON.stringify(u)).not.toContain("scrypt");
    }
  });

  it("drops entries without a username or a name, and unknown roles", () => {
    process.env.AUTH_USERS_FILE = join(process.cwd(), "config", "auth-users.demo.yml");
    expect(listUsers().every((u) => u.username && u.name)).toBe(true);
    expect(listUsers().flatMap((u) => u.roles).every((r) => ["admin", "devops", "qa", "viewer"].includes(r))).toBe(true);
  });
});
