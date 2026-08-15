import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { GET, POST } from "@/app/api/v1/environments/route";
import { PUT, DELETE } from "@/app/api/v1/environments/[id]/route";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });
const post = (b: unknown, h: Record<string, string> = {}) =>
  new Request("http://x/api/v1/environments", { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) });
const idctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("environments API", () => {
  it("POST needs token; creates; GET lists active", async () => {
    expect((await POST(post({ name: "Canary", color: "#123456" }))).status).toBe(401);
    const made = await (await POST(post({ name: "Canary", color: "#123456" }, AUTH))).json();
    expect(made.slug).toBe("canary");
    const list = await (await GET(new Request("http://x/api/v1/environments", { headers: AUTH }))).json();
    expect(list.some((e: { slug: string }) => e.slug === "canary")).toBe(true);
  });
  it("rejects blank name / bad color / duplicate slug", async () => {
    expect((await POST(post({ name: "", color: "#123456" }, AUTH))).status).toBe(400);
    expect((await POST(post({ name: "X", color: "red" }, AUTH))).status).toBe(400);
    await POST(post({ name: "Dup", color: "#123456" }, AUTH));
    expect((await POST(post({ name: "Dup", color: "#123456" }, AUTH))).status).toBe(400);
  });
  it("PUT updates, DELETE soft-deletes", async () => {
    const made = await (await POST(post({ name: "Temp", color: "#123456" }, AUTH))).json();
    const put = new Request("http://x", { method: "PUT", headers: { "content-type": "application/json", ...AUTH }, body: JSON.stringify({ color: "#abcdef" }) });
    expect((await (await PUT(put, idctx(made.id))).json()).color).toBe("#abcdef");
    expect((await DELETE(new Request("http://x", { method: "DELETE", headers: AUTH }), idctx(made.id))).status).toBe(200);
    const after = await (await GET(new Request("http://x/api/v1/environments", { headers: AUTH }))).json();
    expect(after.some((e: { id: string }) => e.id === made.id)).toBe(false);
  });
});
