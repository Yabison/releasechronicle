import { describe, it, expect, afterEach, beforeEach, afterAll } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resetDb, prisma } from "../setup/db";
import { hashPassword } from "@/lib/auth/localProvider";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";

const FIX = join(process.cwd(), "config", "auth-users.login.test.yml");
beforeEach(async () => {
  await resetDb();
  // Importing the Prisma client pulls in .env, which sets AUTH_PROVIDER=ldap for
  // the dev stack. These tests exercise the local YAML provider, so pin it.
  process.env.AUTH_PROVIDER = "local";
});
afterEach(() => {
  try { rmSync(FIX); } catch {}
  delete process.env.AUTH_USERS_FILE;
  delete process.env.AUTH_PROVIDER;
});
afterAll(async () => { await prisma.$disconnect(); });
function seedUser() {
  writeFileSync(FIX, `users:\n  - username: al\n    name: Alice\n    roles: [admin]\n    passwordHash: "${hashPassword("pw")}"\n`);
  process.env.AUTH_USERS_FILE = FIX;
}
// The login limiter keys on client IP + username, so each test uses its own IP to
// stay independent of the others' failure counts.
const req = (body: unknown, ip = "10.0.0.1") =>
  new Request("http://x/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

describe("auth routes", () => {
  it("logs in with valid creds and sets a cookie", async () => {
    seedUser();
    const res = await login(req({ username: "al", password: "pw" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/rc_session=/);
    const token = cookie!.split("rc_session=")[1].split(";")[0];
    const meRes = await me(new Request("http://x/api/auth/me", { headers: { cookie: `rc_session=${token}` } }));
    expect((await meRes.json()).user.name).toBe("Alice");
  });
  it("rejects bad credentials with 401", async () => {
    seedUser();
    expect((await login(req({ username: "al", password: "nope" }))).status).toBe(401);
  });
  it("stops guessing after 5 failures from the same client", async () => {
    seedUser();
    const ip = "10.0.0.2";
    for (let i = 0; i < 5; i++) {
      expect((await login(req({ username: "al", password: `guess${i}` }, ip))).status).toBe(401);
    }
    const blocked = await login(req({ username: "al", password: "guess5" }, ip));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("blocks the right password too, once the client is throttled", async () => {
    seedUser();
    const ip = "10.0.0.3";
    for (let i = 0; i < 5; i++) await login(req({ username: "al", password: "nope" }, ip));
    expect((await login(req({ username: "al", password: "pw" }, ip))).status).toBe(429);
  });
  it("a successful login clears the failure count", async () => {
    seedUser();
    const ip = "10.0.0.4";
    for (let i = 0; i < 4; i++) await login(req({ username: "al", password: "nope" }, ip));
    expect((await login(req({ username: "al", password: "pw" }, ip))).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      expect((await login(req({ username: "al", password: "nope" }, ip))).status).toBe(401);
    }
  });
  it("throttles per client, not globally", async () => {
    seedUser();
    for (let i = 0; i < 5; i++) await login(req({ username: "al", password: "nope" }, "10.0.0.5"));
    expect((await login(req({ username: "al", password: "pw" }, "10.0.0.6"))).status).toBe(200);
  });
  it("audits a successful login with the actor and client IP", async () => {
    seedUser();
    await login(req({ username: "al", password: "pw" }, "10.0.0.7"));
    const [row] = await prisma.auditLog.findMany({ where: { action: "auth.login" } });
    expect(row).toMatchObject({ actor: "Alice", actorIp: "10.0.0.7", ok: true });
  });
  it("audits a failed login without recording the password", async () => {
    seedUser();
    await login(req({ username: "al", password: "nope" }, "10.0.0.8"));
    const [row] = await prisma.auditLog.findMany({ where: { action: "auth.login_failed" } });
    expect(row).toMatchObject({ actorIp: "10.0.0.8", ok: false });
    expect(JSON.stringify(row.detail)).toContain("al");
    expect(JSON.stringify(row.detail)).not.toContain("nope");
  });
  it("audits a throttled attempt distinctly from a wrong password", async () => {
    seedUser();
    const ip = "10.0.0.9";
    for (let i = 0; i < 6; i++) await login(req({ username: "al", password: "nope" }, ip));
    expect(await prisma.auditLog.count({ where: { action: "auth.login_blocked" } })).toBe(1);
  });
  it("logout clears the cookie", async () => {
    const res = await logout(new Request("http://x/api/auth/logout", { method: "POST" }));
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
  it("me without a cookie → null user", async () => {
    expect((await (await me(new Request("http://x/api/auth/me"))).json()).user).toBeNull();
  });
});
