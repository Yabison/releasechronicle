import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { GET as listGET, POST } from "@/app/api/v1/calendar-feeds/route";
import { GET as icsGET } from "@/app/api/v1/calendars/[token]/route";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/calendar-feeds", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("calendar feeds", () => {
  it("requires a token to create", async () => {
    expect((await POST(post({ name: "Prod" }))).status).toBe(401);
  });

  it("creates a feed and serves its .ics by token", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({ productId: p.id, name: "API", type: "API" });
    await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
      fields: { version: "1.2.3", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: null } });

    const created = await (await POST(post({ name: "Prod Checkout", company: "acme", environment: "PROD", types: ["DEPLOYMENT"] }, AUTH))).json();
    expect(created.token).toHaveLength(32);
    expect(await (await listGET(new Request("http://x", { headers: AUTH }))).json()).toHaveLength(1);

    const res = await icsGET(new Request("http://x"), { params: Promise.resolve({ token: `${created.token}.ics` }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("[MEP] checkout/api");
  });

  it("404s an unknown token", async () => {
    const res = await icsGET(new Request("http://x"), { params: Promise.resolve({ token: "nope.ics" }) });
    expect(res.status).toBe(404);
  });
});
