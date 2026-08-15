import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { recordAudit } from "@/lib/audit";
import { GET } from "@/app/api/v1/audit/route";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

const req = (qs = "", headers: Record<string, string> = {}) =>
  new Request(`http://x/api/v1/audit${qs}`, { headers });

async function seed() {
  await recordAudit({ action: "auth.login", actor: "bob" });
  await recordAudit({ action: "auth.login_failed", actor: null, ok: false });
  await recordAudit({ action: "hook.created", actor: "bob", target: "h1" });
}

describe("audit API", () => {
  it("requires an admin session — the trail names who did what", async () => {
    expect((await GET(req())).status).toBe(401);
  });
  it("refuses a signed-in non-admin", async () => {
    const qa = await sessionCookie(["qa"], "Alice");
    expect((await GET(req("", qa))).status).toBe(403);
  });
  it("returns rows newest-first with a total", async () => {
    await seed();
    const { rows, total } = await (await GET(req("", AUTH))).json();
    expect(total).toBe(3);
    expect(rows[0].action).toBe("hook.created");
  });
  it("filters by action and by outcome", async () => {
    await seed();
    expect((await (await GET(req("?action=auth.login", AUTH))).json()).total).toBe(1);
    expect((await (await GET(req("?ok=false", AUTH))).json()).total).toBe(1);
  });
  it("paginates", async () => {
    await seed();
    const { rows, total } = await (await GET(req("?limit=2&offset=2", AUTH))).json();
    expect(rows).toHaveLength(1);
    expect(total).toBe(3);
  });
});
