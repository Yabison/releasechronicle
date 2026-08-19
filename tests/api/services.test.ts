import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createCompany, createProduct } from "@/lib/hierarchy";
import { GET as listGET, POST } from "@/app/api/v1/services/route";
import { GET as detailGET, PUT, DELETE } from "@/app/api/v1/services/[slug]/route";
import { POST as RESTORE } from "@/app/api/v1/services/[slug]/restore/route";
import { DELETE as DELETE_PRODUCT } from "@/app/api/v1/products/[slug]/route";

let AUTH: { cookie: string };

beforeEach(async () => {
  await resetDb();
  AUTH = await sessionCookie();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedProduct() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return p;
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/services", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/services", () => {
  it("rejects without a token", async () => {
    const p = await seedProduct();
    const res = await POST(post({ productId: p.id, name: "Payment API", type: "API" }));
    expect(res.status).toBe(401);
  });

  it("creates a typed service under a product", async () => {
    const p = await seedProduct();
    const res = await POST(
      post({ productId: p.id, name: "Payment API", type: "API" }, AUTH),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.slug).toBe("payment-api");
    expect(json.type).toBe("API");
  });

  it("returns 400 on an invalid type", async () => {
    const p = await seedProduct();
    const res = await POST(
      post({ productId: p.id, name: "Payment API", type: "WIDGET" }, AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when fields are missing", async () => {
    const res = await POST(post({ name: "Payment API" }, AUTH));
    expect(res.status).toBe(400);
  });

  it("returns 400 when productId does not exist", async () => {
    const res = await POST(
      post({ productId: "does-not-exist", name: "Payment API", type: "API" }, AUTH),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when productId belongs to a soft-deleted product", async () => {
    const p = await seedProduct();
    await DELETE_PRODUCT(
      new Request("http://x/api/v1/products/checkout?company=acme", { method: "DELETE", headers: AUTH }),
      { params: Promise.resolve({ slug: "checkout" }) },
    );
    const res = await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    expect(res.status).toBe(400);
  });

  it("returns 400 on blank name", async () => {
    const p = await seedProduct();
    const res = await POST(post({ productId: p.id, name: "   ", type: "API" }, AUTH));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/services?company=&product=", () => {
  it("lists services for a product", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await listGET(
      new Request("http://x/api/v1/services?company=acme&product=checkout", { headers: AUTH }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
  });
});

describe("GET /api/v1/services/[slug]?company=&product=", () => {
  it("returns the service", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await detailGET(
      new Request("http://x/api/v1/services/payment-api?company=acme&product=checkout"),
      { params: Promise.resolve({ slug: "payment-api" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Payment API");
  });

  it("returns 404 for an unknown service", async () => {
    await seedProduct();
    const res = await detailGET(
      new Request("http://x/api/v1/services/nope?company=acme&product=checkout"),
      { params: Promise.resolve({ slug: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});

function put(slug: string, company: string, product: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/services/${slug}?company=${company}&product=${product}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("PUT /api/v1/services/[slug] (move to another product)", () => {
  it("rejects without a token", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await PUT(
      put("payment-api", "acme", "checkout", { productId: p.id }),
      ctx("payment-api"),
    );
    expect(res.status).toBe(401);
  });

  it("moves a service to another product", async () => {
    const p = await seedProduct();
    const other = await createProduct({ companyId: p.companyId, name: "Billing" });
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));

    const res = await PUT(
      put("payment-api", "acme", "checkout", { productId: other.id }, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.productId).toBe(other.id);

    const moved = await detailGET(
      new Request("http://x/api/v1/services/payment-api?company=acme&product=billing"),
      ctx("payment-api"),
    );
    expect(moved.status).toBe(200);
  });

  it("returns 409 when the target product already has a service with the same slug", async () => {
    const p = await seedProduct();
    const other = await createProduct({ companyId: p.companyId, name: "Billing" });
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    await POST(post({ productId: other.id, name: "Payment API", type: "API" }, AUTH));

    const res = await PUT(
      put("payment-api", "acme", "checkout", { productId: other.id }, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown service", async () => {
    const p = await seedProduct();
    const res = await PUT(
      put("nope", "acme", "checkout", { productId: p.id }, AUTH),
      ctx("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 (not 500) when the target product is soft-deleted", async () => {
    const p = await seedProduct();
    const other = await createProduct({ companyId: p.companyId, name: "Billing" });
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    await DELETE_PRODUCT(
      new Request("http://x/api/v1/products/billing?company=acme", { method: "DELETE", headers: AUTH }),
      { params: Promise.resolve({ slug: "billing" }) },
    );
    const res = await PUT(
      put("payment-api", "acme", "checkout", { productId: other.id }, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(409);
    // control: the service never moved
    const check = await detailGET(
      new Request("http://x/api/v1/services/payment-api?company=acme&product=checkout"),
      ctx("payment-api"),
    );
    expect(check.status).toBe(200);
  });

  it("ignores a non-string productId and still applies other fields", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));

    const res = await PUT(
      put("payment-api", "acme", "checkout", { productId: 123, sortOrder: 5 }, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).sortOrder).toBe(5);
  });
});

describe("PUT /api/v1/services/[slug] (build URL + master flag)", () => {
  it("sets and clears the build URL template", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const set = await PUT(
      put("payment-api", "acme", "checkout", { buildUrlTemplate: "https://ci/{version}" }, AUTH),
      ctx("payment-api"),
    );
    expect(set.status).toBe(200);
    expect((await set.json()).buildUrlTemplate).toBe("https://ci/{version}");

    const clear = await PUT(
      put("payment-api", "acme", "checkout", { buildUrlTemplate: "  " }, AUTH),
      ctx("payment-api"),
    );
    expect((await clear.json()).buildUrlTemplate).toBeNull();
  });

  it("sets isMaster and demotes the previous master in the same product", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    await POST(post({ productId: p.id, name: "Ledger API", type: "API" }, AUTH));

    const first = await PUT(
      put("payment-api", "acme", "checkout", { isMaster: true }, AUTH),
      ctx("payment-api"),
    );
    expect((await first.json()).isMaster).toBe(true);

    // Making a sibling master must demote the first (one main app per product).
    const second = await PUT(
      put("ledger-api", "acme", "checkout", { isMaster: true }, AUTH),
      ctx("ledger-api"),
    );
    expect((await second.json()).isMaster).toBe(true);

    const masters = await prisma.service.findMany({ where: { productId: p.id, isMaster: true } });
    expect(masters).toHaveLength(1);
    expect(masters[0].slug).toBe("ledger-api");
  });

  it("returns 400 when no updatable field is given", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await PUT(
      put("payment-api", "acme", "checkout", {}, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(400);
  });

  it("overrides the env workflow on a service", async () => {
    const p = await seedProduct();
    await prisma.environmentConfig.createMany({
      data: [
        { slug: "DEV", name: "DEV", color: "#64748b", sortOrder: 0 },
        { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 1 },
      ],
    });
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await PUT(
      put("payment-api", "acme", "checkout", { envWorkflowOverride: true, envWorkflow: ["DEV", "PROD"] }, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.envWorkflowOverride).toBe(true);
    expect(j.envWorkflow).toEqual(["DEV", "PROD"]);
  });

  it("rejects an env workflow with an unknown environment", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await PUT(
      put("payment-api", "acme", "checkout", { envWorkflow: ["NOPE"] }, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(400);
  });

  it("ignores a non-string buildUrlTemplate and still applies other fields", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await PUT(
      put("payment-api", "acme", "checkout", { buildUrlTemplate: 42, isMaster: true }, AUTH),
      ctx("payment-api"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isMaster).toBe(true);
    expect(json.buildUrlTemplate).toBeNull();
  });
});

function del(slug: string, company: string, product: string, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/services/${slug}?company=${company}&product=${product}`, { method: "DELETE", headers });
}
function restore(slug: string, company: string, product: string, headers: Record<string, string> = {}) {
  return new Request(`http://x/api/v1/services/${slug}/restore?company=${company}&product=${product}`, { method: "POST", headers });
}

describe("DELETE /api/v1/services/[slug]", () => {
  it("rejects without a session", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await DELETE(del("payment-api", "acme", "checkout"), ctx("payment-api"));
    expect(res.status).toBe(401);
  });

  it("returns 400 without company/product query params", async () => {
    const res = await DELETE(
      new Request("http://x/api/v1/services/payment-api", { method: "DELETE", headers: AUTH }),
      ctx("payment-api"),
    );
    expect(res.status).toBe(400);
  });

  it("soft-deletes a service and it drops out of the listing", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));

    const res = await DELETE(del("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    expect(res.status).toBe(200);

    const listed = await listGET(
      new Request("http://x/api/v1/services?company=acme&product=checkout", { headers: AUTH }),
    );
    expect(await listed.json()).toEqual([]);
  });

  it("returns 404 deleting an unknown service", async () => {
    await seedProduct();
    const res = await DELETE(del("nope", "acme", "checkout", AUTH), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("returns a sane non-500 status deleting an already-deleted service", async () => {
    // Same resolution-level 404 as companies/products: getServiceBySlug filters deletedAt.
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    await DELETE(del("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    const res = await DELETE(del("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/services?includeDeleted=1", () => {
  it("shows deleted services to an admin, ignores it for a non-admin", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    await DELETE(del("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));

    const admin = await listGET(
      new Request("http://x/api/v1/services?company=acme&product=checkout&includeDeleted=1", { headers: AUTH }),
    );
    expect(await admin.json()).toHaveLength(1);

    const nonAdmin = await sessionCookie(["viewer"]);
    const viewer = await listGET(
      new Request("http://x/api/v1/services?company=acme&product=checkout&includeDeleted=1", { headers: nonAdmin }),
    );
    expect(await viewer.json()).toEqual([]);

    const anon = await listGET(
      new Request("http://x/api/v1/services?company=acme&product=checkout&includeDeleted=1"),
    );
    expect(await anon.json()).toEqual([]);
  });
});

describe("POST /api/v1/services/[slug]/restore", () => {
  it("rejects without a session", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await RESTORE(restore("payment-api", "acme", "checkout"), ctx("payment-api"));
    expect(res.status).toBe(401);
  });

  it("restores a deleted service", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    await DELETE(del("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    const res = await RESTORE(restore("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    expect(res.status).toBe(200);
    const check = await detailGET(
      new Request("http://x/api/v1/services/payment-api?company=acme&product=checkout"),
      ctx("payment-api"),
    );
    expect(check.status).toBe(200);
  });

  it("returns 409 when the deleted service's product is also deleted", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    // Deleting the product cascades to the service (same batch).
    await DELETE_PRODUCT(
      new Request("http://x/api/v1/products/checkout?company=acme", { method: "DELETE", headers: AUTH }),
      { params: Promise.resolve({ slug: "checkout" }) },
    );
    const res = await RESTORE(restore("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/product/i);
  });

  it("returns 409 when a live service already holds the slug", async () => {
    const p = await seedProduct();
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    await DELETE(del("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    await POST(post({ productId: p.id, name: "Payment API", type: "API" }, AUTH));
    const res = await RESTORE(restore("payment-api", "acme", "checkout", AUTH), ctx("payment-api"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/slug/i);
  });

  it("returns 404 restoring an unknown service", async () => {
    await seedProduct();
    const res = await RESTORE(restore("nope", "acme", "checkout", AUTH), ctx("nope"));
    expect(res.status).toBe(404);
  });
});
