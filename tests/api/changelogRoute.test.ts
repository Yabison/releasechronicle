import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { GET } from "@/app/api/v1/services/[slug]/changelog/route";
import { upsertChangelogFromCi } from "@/lib/changelog";
import { setChangelogVisibility } from "@/lib/visibility";
import { sessionCookie } from "../setup/session";

let AUTH: { cookie: string };
beforeEach(async () => { await resetDb(); AUTH = await sessionCookie(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seed({ isPublic = false }: { isPublic?: boolean } = {}) {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  if (isPublic) {
    await prisma.company.update({ where: { id: c.id }, data: { public: true } });
    await prisma.product.update({ where: { id: p.id }, data: { public: true } });
    await prisma.service.update({ where: { id: s.id }, data: { public: true } });
  }
  await upsertChangelogFromCi(s.id, "1.0.0", "### Ajouté\n- le tri");
  return s.id;
}

const get = (qs = "?company=acme&product=checkout", headers?: HeadersInit) =>
  GET(new Request(`http://x/api/v1/services/api/changelog${qs}`, { headers }),
      { params: Promise.resolve({ slug: "api" }) });

describe("GET /services/{slug}/changelog", () => {
  it("returns the notes to a signed-in caller", async () => {
    await seed();
    const res = await get(undefined, AUTH);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({ version: "1.0.0", source: "CI" });
    expect(body.items[0].body).toContain("le tri");
  });

  it("requires company and product", async () => {
    await seed();
    expect((await get("?company=acme", AUTH)).status).toBe(400);
  });

  it("404s on an unknown service", async () => {
    await seed();
    expect((await get("?company=acme&product=ghost", AUTH)).status).toBe(404);
  });

  it("refuses an anonymous caller in AUTHENTICATED mode", async () => {
    await seed({ isPublic: true });
    expect((await get()).status).toBe(404);
  });

  it("serves an anonymous caller in PUBLIC mode when the chain is public", async () => {
    await seed({ isPublic: true });
    await setChangelogVisibility("PUBLIC");
    expect((await get()).status).toBe(200);
  });

  // Le réglage ne fait que retirer : il n'ouvre jamais un service privé.
  it("still refuses an anonymous caller in PUBLIC mode when the service is private", async () => {
    await seed({ isPublic: false });
    await setChangelogVisibility("PUBLIC");
    expect((await get()).status).toBe(404);
  });
});
