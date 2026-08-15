import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { sessionCookie } from "../setup/session";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { GET as listGET, POST } from "@/app/api/v1/services/[slug]/ingest-sources/route";
import { DELETE } from "@/app/api/v1/services/[slug]/ingest-sources/[id]/route";
import { GET as companyGET, POST as companyPOST } from "@/app/api/v1/companies/[slug]/ingest-sources/route";
import { GET as globalGET, POST as globalPOST } from "@/app/api/v1/ingest-sources/route";
import { DELETE as genericDELETE } from "@/app/api/v1/ingest-sources/[id]/route";

let AUTH: { cookie: string };
async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
}
const url = () => "http://x/api/v1/services/api/ingest-sources?company=acme&product=checkout";
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const dctx = (slug: string, id: string) => ({ params: Promise.resolve({ slug, id }) });
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(url(), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("ingest-sources API", () => {
  it("rejects POST without a session", async () => {
    await seed();
    expect((await POST(post({ label: "ci", defaultEnvironment: "PROD" }), ctx("api"))).status).toBe(401);
  });
  it("creates, lists, then deletes a source", async () => {
    await seed();
    const created = await (await POST(post({ label: "ci", defaultEnvironment: "PROD" }, AUTH), ctx("api"))).json();
    expect(created.token).toBeTruthy();
    const list = await (await listGET(new Request(url(), { headers: AUTH }), ctx("api"))).json();
    expect(list).toHaveLength(1);
    const del = await DELETE(new Request("http://x?company=acme&product=checkout", { method: "DELETE", headers: AUTH }), dctx("api", created.id));
    expect(del.status).toBe(200);
    expect(await prisma.ingestSource.count()).toBe(0);
  });
  it("audits the creation and the deletion of a CI token", async () => {
    await seed();
    const created = await (await POST(post({ label: "ci", defaultEnvironment: "PROD" }, AUTH), ctx("api"))).json();
    await DELETE(new Request("http://x?company=acme&product=checkout", { method: "DELETE", headers: AUTH }), dctx("api", created.id));
    const rows = await prisma.auditLog.findMany({ orderBy: { at: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["ingestSource.created", "ingestSource.deleted"]);
    expect(rows[0].actor).toBe("Tester");
    // The point of the guard is that the token never leaves via a read; the audit
    // trail must not become the second copy.
    expect(JSON.stringify(rows)).not.toContain(created.token);
  });
  it("rejects GET without a session", async () => {
    await seed();
    expect((await listGET(new Request(url()), ctx("api"))).status).toBe(401);
  });
  it("404 for an unknown service", async () => {
    await seed();
    const res = await POST(new Request("http://x/api/v1/services/ghost/ingest-sources?company=acme&product=checkout", { method: "POST", headers: { "content-type": "application/json", ...AUTH }, body: JSON.stringify({ label: "x", defaultEnvironment: "PROD" }) }), ctx("ghost"));
    expect(res.status).toBe(404);
  });
});

describe("company + global ingest-sources", () => {
  const cctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
  const idctx = (id: string) => ({ params: Promise.resolve({ id }) });
  function creq(body: unknown, headers: Record<string, string> = {}) {
    return new Request("http://x/api/v1/companies/acme/ingest-sources", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  }
  function greq(body: unknown, headers: Record<string, string> = {}) {
    return new Request("http://x/api/v1/ingest-sources", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  }

  it("company POST requires a session", async () => {
    await seed();
    expect((await companyPOST(creq({ label: "ci", defaultEnvironment: "PROD" }), cctx("acme"))).status).toBe(401);
  });
  it("creates + lists + deletes a company source", async () => {
    await seed();
    const made = await (await companyPOST(creq({ label: "ci", defaultEnvironment: "PROD" }, AUTH), cctx("acme"))).json();
    expect(made.scope).toBe("COMPANY");
    expect(made.token).toBeTruthy();
    const list = await (await companyGET(new Request("http://x/api/v1/companies/acme/ingest-sources", { headers: AUTH }), cctx("acme"))).json();
    expect(list).toHaveLength(1);
    const del = await genericDELETE(new Request("http://x", { method: "DELETE", headers: AUTH }), idctx(made.id));
    expect(del.status).toBe(200);
    expect(await prisma.ingestSource.count()).toBe(0);
  });
  it("creates + lists a global source", async () => {
    await seed();
    const res = await globalPOST(greq({ label: "ci", defaultEnvironment: "PROD" }, AUTH));
    const made = await res.json();
    expect(made.scope).toBe("GLOBAL");
    const list = await (await globalGET(new Request("http://x/api/v1/ingest-sources", { headers: AUTH }))).json();
    expect(list.some((s: { id: string }) => s.id === made.id)).toBe(true);
  });
  it("company GET requires a session", async () => {
    await seed();
    expect((await companyGET(new Request("http://x/api/v1/companies/acme/ingest-sources"), cctx("acme"))).status).toBe(401);
  });
  it("global GET requires a session", async () => {
    await seed();
    expect((await globalGET(new Request("http://x/api/v1/ingest-sources"))).status).toBe(401);
  });
  it("generic delete requires a session", async () => {
    await seed();
    const made = await (await globalPOST(greq({ label: "ci", defaultEnvironment: "PROD" }, AUTH))).json();
    expect((await genericDELETE(new Request("http://x", { method: "DELETE" }), idctx(made.id))).status).toBe(401);
  });
  it("accepts ALL as no default environment (null)", async () => {
    await seed();
    const res = await globalPOST(greq({ label: "ci", defaultEnvironment: "ALL" }, AUTH));
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(made.defaultEnvironment).toBeNull();
  });
});
