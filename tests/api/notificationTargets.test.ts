import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { GET, POST } from "@/app/api/v1/notification-targets/route";
import { PUT, DELETE } from "@/app/api/v1/notification-targets/[id]/route";
import { createCompany, createProduct } from "@/lib/hierarchy";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });
const post = (b: unknown, h: Record<string, string> = {}) => new Request("http://x/api/v1/notification-targets", { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) });
const idctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("notification-targets API", () => {
  it("POST needs an admin session", async () => {
    expect((await POST(post({ type: "email", label: "Ops", config: { to: ["a@x"] } }))).status).toBe(401);
  });
  it("audits creating and deleting a target", async () => {
    const made = await (await POST(post({ type: "webhook", label: "CI", config: { url: "https://h/x" } }, AUTH))).json();
    await DELETE(new Request("http://x", { method: "DELETE", headers: AUTH }), idctx(made.id));
    const rows = await prisma.auditLog.findMany({ orderBy: { at: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["notificationTarget.created", "notificationTarget.deleted"]);
  });
  it("GET needs an admin session (config holds webhook URLs)", async () => {
    expect((await GET(new Request("http://x/api/v1/notification-targets"))).status).toBe(401);
  });
  it("creates an email target and lists it", async () => {
    const made = await (await POST(post({ type: "email", label: "Ops", config: { to: ["a@x", "b@x"] } }, AUTH))).json();
    expect(made.type).toBe("email");
    const list = await (await GET(new Request("http://x/api/v1/notification-targets", { headers: AUTH }))).json();
    expect(list.some((t: { id: string }) => t.id === made.id)).toBe(true);
  });
  it("rejects a webhook url pointed at the metadata endpoint", async () => {
    const res = await POST(post({ type: "webhook", label: "x", config: { url: "http://169.254.169.254/latest" } }, AUTH));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/link-local/);
  });
  it("rejects a non-http scheme for a teams target", async () => {
    expect((await POST(post({ type: "teams", label: "x", config: { url: "file:///etc/passwd" } }, AUTH))).status).toBe(400);
  });
  it("rejects a bad type / empty recipients / missing url", async () => {
    expect((await POST(post({ type: "sms", label: "x", config: {} }, AUTH))).status).toBe(400);
    expect((await POST(post({ type: "email", label: "x", config: { to: [] } }, AUTH))).status).toBe(400);
    expect((await POST(post({ type: "webhook", label: "x", config: {} }, AUTH))).status).toBe(400);
  });
  it("PUT updates, DELETE removes; DELETE of a referenced target → 409", async () => {
    const made = await (await POST(post({ type: "webhook", label: "CI", config: { url: "https://h/x" } }, AUTH))).json();
    expect((await (await PUT(new Request("http://x", { method: "PUT", headers: { "content-type": "application/json", ...AUTH }, body: JSON.stringify({ label: "CI2" }) }), idctx(made.id))).json()).label).toBe("CI2");
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    await prisma.hook.create({ data: { productId: p.id, type: "webhook", events: ["*"], config: {}, enabled: true, targetId: made.id } });
    expect((await DELETE(new Request("http://x", { method: "DELETE", headers: AUTH }), idctx(made.id))).status).toBe(409);
  });
});
