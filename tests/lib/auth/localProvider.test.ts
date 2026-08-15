import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { hashPassword, verifyPassword, localProvider } from "@/lib/auth/localProvider";

const FIX = join(process.cwd(), "config", "auth-users.test.yml");
afterEach(() => { try { rmSync(FIX); } catch {} delete process.env.AUTH_USERS_FILE; });

function withUsers(yaml: string) {
  writeFileSync(FIX, yaml);
  process.env.AUTH_USERS_FILE = FIX;
}

describe("password hashing", () => {
  it("round-trips", () => {
    const h = hashPassword("s3cret");
    expect(h.startsWith("scrypt:")).toBe(true);
    expect(verifyPassword("s3cret", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});

describe("localProvider.authenticate", () => {
  it("returns the user on valid credentials, filtering unknown roles", () => {
    const h = hashPassword("pw");
    withUsers(`users:\n  - username: bob\n    name: Bob\n    email: b@x\n    roles: [devops, wizard]\n    passwordHash: "${h}"\n`);
    return localProvider.authenticate("bob", "pw").then((u) => {
      expect(u).not.toBeNull();
      expect(u!.sub).toBe("bob");
      expect(u!.roles).toEqual(["devops"]); // "wizard" dropped
    });
  });
  it("rejects wrong password + unknown user", async () => {
    const h = hashPassword("pw");
    withUsers(`users:\n  - username: bob\n    name: Bob\n    roles: [qa]\n    passwordHash: "${h}"\n`);
    expect(await localProvider.authenticate("bob", "nope")).toBeNull();
    expect(await localProvider.authenticate("ghost", "pw")).toBeNull();
  });
  it("no config file → all logins fail (no throw)", async () => {
    process.env.AUTH_USERS_FILE = join(process.cwd(), "config", "does-not-exist.yml");
    expect(await localProvider.authenticate("bob", "pw")).toBeNull();
  });
});
