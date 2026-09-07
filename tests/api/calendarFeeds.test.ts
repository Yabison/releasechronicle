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

  /**
   * The two options a feed carries beyond its scope: a group standing for several
   * environments, and the choice to serve one event per lot rather than per service.
   * Both must survive the round trip to the .ics, since the feed row is the only
   * place a subscriber's settings live.
   */
  it("serves one event per lot when the feed merges them", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const api = await createService({ productId: p.id, name: "API", type: "API" });
    const web = await createService({ productId: p.id, name: "Web", type: "APP" });
    for (const s of [api, web]) {
      await createEvent({ serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
        fields: { version: "2.1.0", requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: "release-08" } });
    }

    const created = await (await POST(post({ name: "Lots", environment: "PROD", types: ["DEPLOYMENT"], mergeLots: true }, AUTH))).json();
    expect(created.mergeLots).toBe(true);

    const body = await (await icsGET(new Request("http://x"), { params: Promise.resolve({ token: created.token }) })).text();

    expect(body).toContain("[MEP] lot release-08 (PROD)");
    expect(body).not.toContain("[MEP] checkout/api");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("serves every environment of a group the feed is scoped to", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    const s = await createService({ productId: p.id, name: "API", type: "API" });
    await prisma.environmentGroup.create({ data: { slug: "allprod", name: "ALLPROD", members: ["PROD", "SECURE"], sortOrder: 0 } });
    for (const [environment, version] of [["PROD", "in-prod"], ["SECURE", "in-secure"], ["RECETTE", "in-recette"]]) {
      await createEvent({ serviceId: s.id, environment, type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
        fields: { version, requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: null } });
    }

    const created = await (await POST(post({ name: "All prod", environment: "group:allprod", types: ["DEPLOYMENT"] }, AUTH))).json();
    expect(created.environment).toBe("group:allprod");

    const body = await (await icsGET(new Request("http://x"), { params: Promise.resolve({ token: created.token }) })).text();

    expect(body).toContain("in-prod");
    expect(body).toContain("in-secure");
    expect(body).not.toContain("in-recette");
  });

  it("404s an unknown token", async () => {
    const res = await icsGET(new Request("http://x"), { params: Promise.resolve({ token: "nope.ics" }) });
    expect(res.status).toBe(404);
  });
});
