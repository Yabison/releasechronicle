import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { GET as listGET, POST } from "@/app/api/v1/companies/route";
import { GET as detailGET, PUT } from "@/app/api/v1/companies/[slug]/route";

let AUTH: { cookie: string };

beforeEach(async () => {
  await resetDb();
  AUTH = await sessionCookie();
});
afterAll(async () => {
  await prisma.$disconnect();
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/companies", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/companies", () => {
  it("rejects without a token", async () => {
    const res = await POST(post({ name: "Acme" }));
    expect(res.status).toBe(401);
  });

  it("creates a company with a token", async () => {
    const res = await POST(post({ name: "Acme" }, AUTH));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.slug).toBe("acme");
  });

  it("returns 400 on missing name", async () => {
    const res = await POST(post({}, AUTH));
    expect(res.status).toBe(400);
  });

  it("returns 400 on blank name", async () => {
    const res = await POST(post({ name: "   " }, AUTH));
    expect(res.status).toBe(400);
  });

  it("rejects a non-admin session with 403", async () => {
    const nonAdmin = await sessionCookie(["viewer"]);
    const res = await POST(post({ name: "Acme" }, nonAdmin));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/companies", () => {
  it("lists companies to a session", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const res = await listGET(new Request("http://x/api/v1/companies", { headers: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
  it("hides a non-public company from an anonymous caller", async () => {
    // Companies are private unless flagged public, so public mode shows none here.
    await POST(post({ name: "Acme" }, AUTH));
    expect(await (await listGET(new Request("http://x/api/v1/companies"))).json()).toEqual([]);
  });
});

describe("GET /api/v1/companies/[slug]", () => {
  it("returns the company by slug", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const res = await detailGET(new Request("http://x"), {
      params: Promise.resolve({ slug: "acme" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Acme");
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await detailGET(new Request("http://x"), {
      params: Promise.resolve({ slug: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}
function put(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/companies/acme", {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/v1/companies/[slug]", () => {
  it("rejects without a session", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const res = await PUT(put({ autoLotNaming: "date" }), ctx("acme"));
    expect(res.status).toBe(401);
  });

  it("updates autoLotNaming", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const res = await PUT(put({ autoLotNaming: "date" }, AUTH), ctx("acme"));
    expect(res.status).toBe(200);
    expect((await res.json()).autoLotNaming).toBe("date");

    const check = await detailGET(new Request("http://x"), ctx("acme"));
    expect((await check.json()).autoLotNaming).toBe("date");
  });

  it("returns 400 for an invalid autoLotNaming value", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const res = await PUT(put({ autoLotNaming: "bogus" }, AUTH), ctx("acme"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown company", async () => {
    const res = await PUT(put({ autoLotNaming: "date" }, AUTH), ctx("nope"));
    expect(res.status).toBe(404);
  });
});
