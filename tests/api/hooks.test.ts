import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createCompany, createProduct } from "@/lib/hierarchy";
import { GET as listGET, POST } from "@/app/api/v1/products/[slug]/hooks/route";
import { DELETE } from "@/app/api/v1/products/[slug]/hooks/[hookId]/route";
import { GET as deliveriesGET } from "@/app/api/v1/products/[slug]/hooks/deliveries/route";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seed() {
  const c = await createCompany({ name: "Acme" });
  await createProduct({ companyId: c.id, name: "Checkout" });
}
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/v1/products/checkout/hooks?company=acme", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const dctx = (slug: string, hookId: string) => ({ params: Promise.resolve({ slug, hookId }) });

describe("hooks API", () => {
  it("rejects POST without a session", async () => {
    await seed();
    expect((await POST(post({ type: "webhook", url: "https://h/x" }), ctx("checkout"))).status).toBe(401);
  });
  it("audits creating and deleting a hook", async () => {
    await seed();
    const made = await (await POST(post({ type: "webhook", url: "https://h/x" }, AUTH), ctx("checkout"))).json();
    await DELETE(new Request("http://x?company=acme", { method: "DELETE", headers: AUTH }), dctx("checkout", made.id));
    const rows = await prisma.auditLog.findMany({ orderBy: { at: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["hook.created", "hook.deleted"]);
  });
  it("rejects GET without a session (config holds webhook URLs)", async () => {
    await seed();
    expect((await listGET(new Request("http://x/api/v1/products/checkout/hooks?company=acme"), ctx("checkout"))).status).toBe(401);
  });
  it("creates a webhook hook", async () => {
    await seed();
    const res = await POST(post({ type: "webhook", url: "https://h/x" }, AUTH), ctx("checkout"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("webhook");
    expect(json.config.url).toBe("https://h/x");
    expect(json.events).toEqual(["*"]);
  });
  it("rejects a hook url pointed at the metadata endpoint", async () => {
    await seed();
    const res = await POST(post({ type: "webhook", url: "http://169.254.169.254/latest" }, AUTH), ctx("checkout"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/link-local/);
  });
  it("rejects an unregistered type or blank url", async () => {
    await seed();
    expect((await POST(post({ type: "ghost", url: "https://h/x" }, AUTH), ctx("checkout"))).status).toBe(400);
    expect((await POST(post({ type: "webhook", url: "" }, AUTH), ctx("checkout"))).status).toBe(400);
  });
  it("lists then deletes a hook", async () => {
    await seed();
    const created = await (await POST(post({ type: "webhook", url: "https://h/x" }, AUTH), ctx("checkout"))).json();
    const list = await (await listGET(new Request("http://x/api/v1/products/checkout/hooks?company=acme", { headers: AUTH }), ctx("checkout"))).json();
    expect(list).toHaveLength(1);
    const del = await DELETE(new Request(`http://x?company=acme`, { method: "DELETE", headers: AUTH }), dctx("checkout", created.id));
    expect(del.status).toBe(200);
    expect(await prisma.hook.count()).toBe(0);
  });
  it("stores transitions when provided", async () => {
    await seed();
    const res = await POST(post({ type: "webhook", url: "https://h/x", events: ["deploy.status_changed"], transitions: ["DEPLOYED>TESTING"] }, AUTH), ctx("checkout"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.events).toEqual(["deploy.status_changed"]);
    expect(json.transitions).toEqual(["DEPLOYED>TESTING"]);
  });
  it("defaults transitions to an empty array when omitted", async () => {
    await seed();
    const res = await POST(post({ type: "webhook", url: "https://h/x" }, AUTH), ctx("checkout"));
    const json = await res.json();
    expect(json.transitions).toEqual([]);
  });
  it("creates a hook referencing a notification target", async () => {
    await seed();
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "checkout" } });
    const target = await prisma.notificationTarget.create({ data: { type: "webhook", label: "CI", config: { url: "https://target/x" } } });
    const res = await POST(post({ type: "webhook", targetId: target.id, events: ["*"] }, AUTH), ctx("checkout"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.targetId).toBe(target.id);
    expect(json.config).toEqual({});
    void product;
  });
  it("rejects a hook whose target type mismatches the hook type", async () => {
    await seed();
    const target = await prisma.notificationTarget.create({ data: { type: "email", label: "Ops", config: { to: ["a@x"] } } });
    const res = await POST(post({ type: "webhook", targetId: target.id, events: ["*"] }, AUTH), ctx("checkout"));
    expect(res.status).toBe(400);
  });
});

describe("hooks API config object", () => {
  it("creates an email hook from a config object", async () => {
    await seed();
    const req = new Request("http://x/api/v1/products/checkout/hooks?company=acme", {
      method: "POST", headers: { "content-type": "application/json", ...AUTH },
      body: JSON.stringify({ type: "email", config: { to: ["a@x"], subject: "S" } }),
    });
    const res = await POST(req, ctx("checkout"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("email");
    expect(json.config.to).toEqual(["a@x"]);
  });
  it("still rejects an unregistered type", async () => {
    await seed();
    const req = new Request("http://x/api/v1/products/checkout/hooks?company=acme", {
      method: "POST", headers: { "content-type": "application/json", ...AUTH },
      body: JSON.stringify({ type: "ghost", config: { to: ["a@x"] } }),
    });
    expect((await POST(req, ctx("checkout"))).status).toBe(400);
  });
});

describe("GET hook deliveries", () => {
  it("rejects GET without a session (payloads hold message bodies)", async () => {
    await seed();
    const res = await deliveriesGET(new Request("http://x/api/v1/products/checkout/hooks/deliveries?company=acme"), ctx("checkout"));
    expect(res.status).toBe(401);
  });
  it("returns the product's deliveries", async () => {
    await seed();
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "checkout" } });
    const hook = await prisma.hook.create({ data: { productId: product.id, type: "webhook", events: ["*"], config: { url: "x" }, enabled: true } });
    await prisma.hookDelivery.create({ data: { hookId: hook.id, kind: "deploy.created", status: "OK", statusCode: 200, payload: { kind: "deploy.created" } } });
    const res = await deliveriesGET(new Request("http://x/api/v1/products/checkout/hooks/deliveries?company=acme", { headers: AUTH }), ctx("checkout"));
    expect(res.status).toBe(200);
    const { rows, total } = await res.json();
    expect(rows).toHaveLength(1);
    expect(total).toBe(1);
    expect(rows[0].hookType).toBe("webhook");
    expect(rows[0].status).toBe("OK");
  });
  it("404 for an unknown product", async () => {
    await seed();
    const res = await deliveriesGET(new Request("http://x/api/v1/products/ghost/hooks/deliveries?company=acme", { headers: AUTH }), ctx("ghost"));
    expect(res.status).toBe(404);
  });
});

describe("GET hook deliveries — filters", () => {
  async function seedDeliveries() {
    await seed();
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "checkout" } });
    const webhook = await prisma.hook.create({ data: { productId: product.id, type: "webhook", events: ["*"], config: { url: "x" }, enabled: true } });
    const email = await prisma.hook.create({ data: { productId: product.id, type: "email", events: ["*"], config: {}, enabled: true } });
    await prisma.hookDelivery.create({ data: { hookId: webhook.id, kind: "deploy.created", status: "OK", statusCode: 200, createdAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.hookDelivery.create({ data: { hookId: webhook.id, kind: "deploy.status_changed", status: "DEAD", statusCode: 500, error: "Boom Timeout", createdAt: new Date("2026-02-01T00:00:00Z") } });
    await prisma.hookDelivery.create({ data: { hookId: email.id, kind: "incident.created", status: "OK", statusCode: 202, createdAt: new Date("2026-03-01T00:00:00Z") } });
  }
  const q = (params: Record<string, string>) =>
    deliveriesGET(new Request(`http://x/api/v1/products/checkout/hooks/deliveries?company=acme&${new URLSearchParams(params)}`, { headers: AUTH }), ctx("checkout"));

  it("filters by status=DEAD", async () => {
    await seedDeliveries();
    const { rows, total } = await (await q({ status: "DEAD" })).json();
    expect(total).toBe(1);
    expect(rows[0].kind).toBe("deploy.status_changed");
  });
  it("filters by kind", async () => {
    await seedDeliveries();
    const { total } = await (await q({ kind: "incident.created" })).json();
    expect(total).toBe(1);
  });
  it("filters by connector type", async () => {
    await seedDeliveries();
    const { rows, total } = await (await q({ type: "email" })).json();
    expect(total).toBe(1);
    expect(rows[0].hookType).toBe("email");
  });
  it("filters by error (case-insensitive contains)", async () => {
    await seedDeliveries();
    const { total } = await (await q({ error: "timeout" })).json();
    expect(total).toBe(1);
  });
  it("filters by statusCode", async () => {
    await seedDeliveries();
    const { total } = await (await q({ statusCode: "202" })).json();
    expect(total).toBe(1);
  });
  it("bounds by from/to date", async () => {
    await seedDeliveries();
    const { total } = await (await q({ from: "2026-01-15T00:00:00Z", to: "2026-02-15T00:00:00Z" })).json();
    expect(total).toBe(1);
  });
  it("paginates with limit/offset while total reflects the full match", async () => {
    await seedDeliveries();
    const { rows, total } = await (await q({ limit: "2", offset: "2" })).json();
    expect(total).toBe(3);
    expect(rows).toHaveLength(1);
  });
});
