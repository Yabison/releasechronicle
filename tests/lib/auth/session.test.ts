import { describe, it, expect } from "vitest";
import { signSession, verifySession, readSessionFromCookieHeader, sessionSetCookie, sessionClearCookie } from "@/lib/auth/session";

const user = { sub: "alice", name: "Alice", email: "a@x", roles: ["admin", "qa"] as const };

describe("session", () => {
  it("signs then verifies, preserving fields", async () => {
    const t = await signSession({ ...user, roles: [...user.roles] });
    const back = await verifySession(t);
    expect(back?.sub).toBe("alice");
    expect(back?.roles).toEqual(["admin", "qa"]);
  });
  it("rejects a tampered token", async () => {
    const t = await signSession({ ...user, roles: [...user.roles] });
    expect(await verifySession(t.slice(0, -2) + "xx")).toBeNull();
  });
  it("rejects an expired token", async () => {
    const t = await signSession({ ...user, roles: [...user.roles] }, -10);
    expect(await verifySession(t)).toBeNull();
  });
  it("rejects null/garbage", async () => {
    expect(await verifySession(null)).toBeNull();
    expect(await verifySession("not.a.jwt")).toBeNull();
  });
  it("reads a session from a Cookie header", async () => {
    const t = await signSession({ ...user, roles: [...user.roles] });
    const s = await readSessionFromCookieHeader(`foo=bar; rc_session=${t}; x=y`);
    expect(s?.sub).toBe("alice");
    expect(await readSessionFromCookieHeader("foo=bar")).toBeNull();
  });
  it("builds set/clear cookie strings", () => {
    expect(sessionSetCookie("TOK", 60)).toContain("rc_session=TOK");
    expect(sessionSetCookie("TOK", 60)).toMatch(/HttpOnly/i);
    expect(sessionClearCookie()).toMatch(/Max-Age=0/i);
  });
});
