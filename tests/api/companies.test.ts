import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createProduct, createService } from "@/lib/hierarchy";
import { GET as listGET, POST } from "@/app/api/v1/companies/route";
import { GET as detailGET, PUT, DELETE } from "@/app/api/v1/companies/[slug]/route";
import { POST as RESTORE } from "@/app/api/v1/companies/[slug]/restore/route";

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

function del(slug: string, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/companies/${slug}`, { method: "DELETE", headers });
}
function restore(slug: string, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/companies/${slug}/restore`, { method: "POST", headers });
}

describe("DELETE /api/v1/companies/[slug]", () => {
  it("rejects without a session", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const res = await DELETE(del("acme"), ctx("acme"));
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin session with 403", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const nonAdmin = await sessionCookie(["viewer"]);
    const res = await DELETE(del("acme", nonAdmin), ctx("acme"));
    expect(res.status).toBe(403);
  });

  it("soft-deletes a company, returns cascade counts, and it drops out of the listing", async () => {
    const c = await (await POST(post({ name: "Acme" }, AUTH))).json();
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    await createService({ productId: p.id, name: "Payment API", type: "API" });

    const res = await DELETE(del("acme", AUTH), ctx("acme"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.products).toBe(1);
    expect(json.services).toBe(1);

    const listed = await listGET(new Request("http://x/api/v1/companies", { headers: AUTH }));
    expect(await listed.json()).toEqual([]);
  });

  it("returns 404 deleting an unknown company", async () => {
    const res = await DELETE(del("nope", AUTH), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("returns a sane non-500 status deleting an already-deleted company", async () => {
    // The route resolves by getCompanyBySlug, which filters deletedAt: null, so a
    // second delete never even reaches deleteCompany() — it 404s at resolution,
    // same as deleting any other slug that isn't live. Still non-500 either way.
    await POST(post({ name: "Acme" }, AUTH));
    await DELETE(del("acme", AUTH), ctx("acme"));
    const res = await DELETE(del("acme", AUTH), ctx("acme"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/companies?includeDeleted=1", () => {
  it("shows deleted companies to an admin", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    await DELETE(del("acme", AUTH), ctx("acme"));
    const res = await listGET(new Request("http://x/api/v1/companies?includeDeleted=1", { headers: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it("ignores includeDeleted for a non-admin session", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    await DELETE(del("acme", AUTH), ctx("acme"));
    const nonAdmin = await sessionCookie(["viewer"]);
    const res = await listGET(new Request("http://x/api/v1/companies?includeDeleted=1", { headers: nonAdmin }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("ignores includeDeleted for an anonymous caller", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    await DELETE(del("acme", AUTH), ctx("acme"));
    const res = await listGET(new Request("http://x/api/v1/companies?includeDeleted=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /api/v1/companies/[slug]/restore", () => {
  it("rejects without a session", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    await DELETE(del("acme", AUTH), ctx("acme"));
    const res = await RESTORE(restore("acme"), ctx("acme"));
    expect(res.status).toBe(401);
  });

  it("restores a deleted company", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    await DELETE(del("acme", AUTH), ctx("acme"));
    const res = await RESTORE(restore("acme", AUTH), ctx("acme"));
    expect(res.status).toBe(200);
    const check = await detailGET(new Request("http://x"), ctx("acme"));
    expect(check.status).toBe(200);
  });

  it("returns 409 when a live company already holds the slug", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    await DELETE(del("acme", AUTH), ctx("acme"));
    await POST(post({ name: "Acme" }, AUTH));
    const res = await RESTORE(restore("acme", AUTH), ctx("acme"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/slug/i);
  });

  it("returns 404 restoring an unknown company", async () => {
    const res = await RESTORE(restore("nope", AUTH), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("returns a sane non-500 status restoring a company that is not deleted", async () => {
    await POST(post({ name: "Acme" }, AUTH));
    const res = await RESTORE(restore("acme", AUTH), ctx("acme"));
    expect(res.status).toBe(409);
  });
});
