import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seedService() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return (await createService({ productId: p.id, name: "API", type: "API" })).id;
}

describe("Changelog", () => {
  it("allows one note per (service, version)", async () => {
    const serviceId = await seedService();
    await prisma.changelog.create({ data: { serviceId, version: "1.0.0", body: "note" } });
    const again = prisma.changelog.create({ data: { serviceId, version: "1.0.0", body: "autre" } });
    await expect(again).rejects.toMatchObject({ code: "P2002" });
  });

  it("keeps the same version apart across services", async () => {
    const a = await seedService();
    const c = await createCompany({ name: "Globex" });
    const p = await createProduct({ companyId: c.id, name: "Billing" });
    const b = (await createService({ productId: p.id, name: "Worker", type: "APP" })).id;
    await prisma.changelog.create({ data: { serviceId: a, version: "1.0.0", body: "de A" } });
    await prisma.changelog.create({ data: { serviceId: b, version: "1.0.0", body: "de B" } });
    expect(await prisma.changelog.count()).toBe(2);
  });

  it("defaults source to CI and leaves authorName null", async () => {
    const serviceId = await seedService();
    const row = await prisma.changelog.create({ data: { serviceId, version: "1.0.0", body: "note" } });
    expect(row.source).toBe("CI");
    expect(row.authorName).toBeNull();
  });

  it("defaults changelog visibility to AUTHENTICATED", async () => {
    const s = await prisma.publicSetting.create({ data: { id: "singleton" } });
    expect(s.changelogVisibility).toBe("AUTHENTICATED");
  });
});
