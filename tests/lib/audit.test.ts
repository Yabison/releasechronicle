import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { recordAudit, listAuditLog, clientIpOf } from "@/lib/audit";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("recordAudit", () => {
  it("stores who did what, from where", async () => {
    await recordAudit({ action: "auth.login", actor: "bob", actorIp: "10.0.0.1", target: "bob" });
    const [row] = (await listAuditLog({})).rows;
    expect(row).toMatchObject({ action: "auth.login", actor: "bob", actorIp: "10.0.0.1", ok: true });
  });

  it("marks a failure and keeps the detail", async () => {
    await recordAudit({ action: "auth.login_failed", actor: null, ok: false, detail: { username: "bob" } });
    const [row] = (await listAuditLog({})).rows;
    expect(row.ok).toBe(false);
    expect(row.detail).toEqual({ username: "bob" });
  });

  it("never lets a logging failure break the caller", async () => {
    // An audit write must not turn a successful login into a 500.
    const spy = vi.spyOn(prisma.auditLog, "create").mockRejectedValueOnce(new Error("db down"));
    const errs = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordAudit({ action: "auth.login", actor: "bob" })).resolves.toBeUndefined();
    expect(errs).toHaveBeenCalled();
    spy.mockRestore();
    errs.mockRestore();
  });
});

describe("listAuditLog", () => {
  async function seed() {
    await recordAudit({ action: "auth.login", actor: "bob" });
    await recordAudit({ action: "auth.login_failed", actor: null, ok: false });
    await recordAudit({ action: "hook.created", actor: "bob", target: "hook-1" });
  }

  it("returns newest first with a total", async () => {
    await seed();
    const { rows, total } = await listAuditLog({});
    expect(total).toBe(3);
    expect(rows[0].action).toBe("hook.created");
  });

  it("filters by action and by outcome", async () => {
    await seed();
    expect((await listAuditLog({ action: "auth.login" })).total).toBe(1);
    expect((await listAuditLog({ ok: false })).total).toBe(1);
  });

  it("paginates", async () => {
    await seed();
    const page = await listAuditLog({ limit: 2, offset: 2 });
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(3);
  });
});

describe("clientIpOf", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { headers: h });

  it("prefers the first x-forwarded-for hop", () => {
    expect(clientIpOf(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip", () => {
    expect(clientIpOf(req({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
  });
  it("returns null when the proxy sent neither", () => {
    expect(clientIpOf(req({}))).toBeNull();
  });
});
