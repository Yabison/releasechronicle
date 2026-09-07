import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { GET as listGET, POST } from "@/app/api/v1/products/route";
import { GET as detailGET, PUT, DELETE } from "@/app/api/v1/products/[slug]/route";
import { POST as RESTORE } from "@/app/api/v1/products/[slug]/restore/route";
import { DELETE as DELETE_COMPANY } from "@/app/api/v1/companies/[slug]/route";

let AUTH: { cookie: string };

beforeEach(async () => {
  await resetDb();
  AUTH = await sessionCookie();
  await prisma.environmentConfig.createMany({
    data: [
      { slug: "DEV", name: "DEV", color: "#64748b", sortOrder: 0 },
      { slug: "QA", name: "QA", color: "#f59e0b", sortOrder: 1 },
      { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 2 },
    ],
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/products", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/products", () => {
  it("rejects without a token", async () => {
    const c = await createCompany({ name: "Acme" });
    const res = await POST(post({ companyId: c.id, name: "Checkout" }));
    expect(res.status).toBe(401);
  });

  it("creates a product under a company", async () => {
    const c = await createCompany({ name: "Acme" });
    const res = await POST(post({ companyId: c.id, name: "Checkout" }, AUTH));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.slug).toBe("checkout");
    expect(json.companyId).toBe(c.id);
  });

  it("returns 400 when companyId or name is missing", async () => {
    const res = await POST(post({ name: "Checkout" }, AUTH));
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyId does not exist", async () => {
    const res = await POST(post({ companyId: "does-not-exist", name: "Checkout" }, AUTH));
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyId belongs to a soft-deleted company", async () => {
    const c = await createCompany({ name: "Acme" });
    await DELETE_COMPANY(
      new Request("http://x/api/v1/companies/acme", { method: "DELETE", headers: AUTH }),
      { params: Promise.resolve({ slug: "acme" }) },
    );
    const res = await POST(post({ companyId: c.id, name: "Checkout" }, AUTH));
    expect(res.status).toBe(400);
  });

  it("returns 400 on blank name", async () => {
    const c = await createCompany({ name: "Acme" });
    const res = await POST(post({ companyId: c.id, name: "   " }, AUTH));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/products?company=slug", () => {
  it("lists products for a company", async () => {
    const c = await createCompany({ name: "Acme" });
    await POST(post({ companyId: c.id, name: "Checkout" }, AUTH));
    const res = await listGET(new Request("http://x/api/v1/products?company=acme", { headers: AUTH }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
  });
});

describe("GET /api/v1/products/[slug]?company=slug", () => {
  it("returns the product within its company", async () => {
    const c = await createCompany({ name: "Acme" });
    await POST(post({ companyId: c.id, name: "Checkout" }, AUTH));
    const res = await detailGET(
      new Request("http://x/api/v1/products/checkout?company=acme"),
      { params: Promise.resolve({ slug: "checkout" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Checkout");
  });

  it("returns 404 for an unknown product", async () => {
    await createCompany({ name: "Acme" });
    const res = await detailGET(
      new Request("http://x/api/v1/products/nope?company=acme"),
      { params: Promise.resolve({ slug: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});

function put(slug: string, company: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/products/${slug}?company=${company}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("PUT /api/v1/products/[slug]", () => {
  it("rejects without a token", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    const res = await PUT(put("checkout", "acme", { envWorkflow: ["DEV"] }), ctx("checkout"));
    expect(res.status).toBe(401);
  });
  it("returns 404 for an unknown product", async () => {
    await createCompany({ name: "Acme" });
    const res = await PUT(put("ghost", "acme", { envWorkflow: ["DEV"] }, AUTH), ctx("ghost"));
    expect(res.status).toBe(404);
  });

  it("sets the envWorkflow", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    const res = await PUT(
      put("checkout", "acme", { envWorkflow: ["DEV", "QA", "PROD"] }, AUTH),
      ctx("checkout"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).envWorkflow).toEqual(["DEV", "QA", "PROD"]);
  });

  it("returns 400 for an invalid envWorkflow entry", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    const res = await PUT(
      put("checkout", "acme", { envWorkflow: ["DEV", "NOPE"] }, AUTH),
      ctx("checkout"),
    );
    expect(res.status).toBe(400);
  });

  it("moves a product to another company", async () => {
    const a = await createCompany({ name: "Acme" });
    const b = await createCompany({ name: "Bravo" });
    await createProduct({ companyId: a.id, name: "Checkout" });

    const res = await PUT(
      put("checkout", "acme", { companyId: b.id }, AUTH),
      ctx("checkout"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.companyId).toBe(b.id);

    const listed = await listGET(new Request("http://x/api/v1/products?company=bravo", { headers: AUTH }));
    const listedJson = await listed.json();
    expect(listedJson.map((p: { slug: string }) => p.slug)).toContain("checkout");
  });

  it("returns 409 (not 500) when the target company is soft-deleted", async () => {
    const a = await createCompany({ name: "Acme" });
    const b = await createCompany({ name: "Bravo" });
    await createProduct({ companyId: a.id, name: "Checkout" });
    await DELETE_COMPANY(
      new Request("http://x/api/v1/companies/bravo", { method: "DELETE", headers: AUTH }),
      { params: Promise.resolve({ slug: "bravo" }) },
    );
    const res = await PUT(
      put("checkout", "acme", { companyId: b.id }, AUTH),
      ctx("checkout"),
    );
    expect(res.status).toBe(409);
    // control: the product never moved
    const check = await detailGET(
      new Request("http://x/api/v1/products/checkout?company=acme"),
      ctx("checkout"),
    );
    expect(check.status).toBe(200);
  });

  it("returns 409 when the target company already has a product with the same slug", async () => {
    const a = await createCompany({ name: "Acme" });
    const b = await createCompany({ name: "Bravo" });
    await createProduct({ companyId: a.id, name: "Checkout" });
    await createProduct({ companyId: b.id, name: "Checkout" });

    const res = await PUT(
      put("checkout", "acme", { companyId: b.id }, AUTH),
      ctx("checkout"),
    );
    expect(res.status).toBe(409);
  });

  it("ignores a non-string companyId and still applies other fields", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });

    const res = await PUT(
      put("checkout", "acme", { companyId: 123, sortOrder: 5 }, AUTH),
      ctx("checkout"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).sortOrder).toBe(5);
  });

  it("ignores a non-string companyId given alone", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });

    const res = await PUT(
      put("checkout", "acme", { companyId: 123 }, AUTH),
      ctx("checkout"),
    );
    expect(res.status).toBe(200);
  });
});

function del(slug: string, company: string, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/products/${slug}?company=${company}`, { method: "DELETE", headers });
}
function restore(slug: string, company: string, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/products/${slug}/restore?company=${company}`, { method: "POST", headers });
}

describe("DELETE /api/v1/products/[slug]", () => {
  it("rejects without a session", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    const res = await DELETE(del("checkout", "acme"), ctx("checkout"));
    expect(res.status).toBe(401);
  });

  it("returns 400 without the company query param", async () => {
    const res = await DELETE(
      new Request("http://x/api/v1/products/checkout", { method: "DELETE", headers: AUTH }),
      ctx("checkout"),
    );
    expect(res.status).toBe(400);
  });

  it("soft-deletes a product, returns cascade counts, and it drops out of the listing", async () => {
    const c = await createCompany({ name: "Acme" });
    const p = await createProduct({ companyId: c.id, name: "Checkout" });
    await createService({ productId: p.id, name: "Payment API", type: "API" });

    const res = await DELETE(del("checkout", "acme", AUTH), ctx("checkout"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.services).toBe(1);

    const listed = await listGET(new Request("http://x/api/v1/products?company=acme", { headers: AUTH }));
    expect(await listed.json()).toEqual([]);
  });

  it("returns 404 deleting an unknown product", async () => {
    await createCompany({ name: "Acme" });
    const res = await DELETE(del("nope", "acme", AUTH), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("returns a sane non-500 status deleting an already-deleted product", async () => {
    // Same resolution-level 404 as companies: getProductBySlug filters deletedAt.
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    await DELETE(del("checkout", "acme", AUTH), ctx("checkout"));
    const res = await DELETE(del("checkout", "acme", AUTH), ctx("checkout"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/products?includeDeleted=1", () => {
  it("shows deleted products to an admin, ignores it for a non-admin", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    await DELETE(del("checkout", "acme", AUTH), ctx("checkout"));

    const admin = await listGET(new Request("http://x/api/v1/products?company=acme&includeDeleted=1", { headers: AUTH }));
    expect(await admin.json()).toHaveLength(1);

    const nonAdmin = await sessionCookie(["viewer"]);
    const viewer = await listGET(new Request("http://x/api/v1/products?company=acme&includeDeleted=1", { headers: nonAdmin }));
    expect(await viewer.json()).toEqual([]);

    const anon = await listGET(new Request("http://x/api/v1/products?company=acme&includeDeleted=1"));
    expect(await anon.json()).toEqual([]);
  });
});

describe("POST /api/v1/products/[slug]/restore", () => {
  it("rejects without a session", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    const res = await RESTORE(restore("checkout", "acme"), ctx("checkout"));
    expect(res.status).toBe(401);
  });

  it("restores a deleted product", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    await DELETE(del("checkout", "acme", AUTH), ctx("checkout"));
    const res = await RESTORE(restore("checkout", "acme", AUTH), ctx("checkout"));
    expect(res.status).toBe(200);
    const check = await detailGET(new Request("http://x/api/v1/products/checkout?company=acme"), ctx("checkout"));
    expect(check.status).toBe(200);
  });

  it("returns 409 when the deleted product's company is also deleted", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    // Deleting the company cascades to the product (same batch).
    await DELETE_COMPANY(
      new Request("http://x/api/v1/companies/acme", { method: "DELETE", headers: AUTH }),
      { params: Promise.resolve({ slug: "acme" }) },
    );
    const res = await RESTORE(restore("checkout", "acme", AUTH), ctx("checkout"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/company/i);
  });

  it("returns 409 when a live product already holds the slug", async () => {
    const c = await createCompany({ name: "Acme" });
    await createProduct({ companyId: c.id, name: "Checkout" });
    await DELETE(del("checkout", "acme", AUTH), ctx("checkout"));
    await createProduct({ companyId: c.id, name: "Checkout" });
    const res = await RESTORE(restore("checkout", "acme", AUTH), ctx("checkout"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/slug/i);
  });

  it("returns 404 restoring an unknown product", async () => {
    await createCompany({ name: "Acme" });
    const res = await RESTORE(restore("nope", "acme", AUTH), ctx("nope"));
    expect(res.status).toBe(404);
  });
});
