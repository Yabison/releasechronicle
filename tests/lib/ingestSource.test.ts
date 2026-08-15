import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createIngestSource, findIngestSourceByToken, listIngestSources, deleteIngestSource } from "@/lib/ingestSource";

async function seedService() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return createService({ productId: p.id, name: "API", type: "API" });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("ingestSource", () => {
  it("creates a source with a unique non-empty token", async () => {
    const s = await seedService();
    const a = await createIngestSource({ scope: "SERVICE", serviceId: s.id, label: "gitlab-ci", defaultEnvironment: "PROD" });
    const b = await createIngestSource({ scope: "SERVICE", serviceId: s.id, label: "gh", defaultEnvironment: "QA" });
    expect(a.token).toBeTruthy();
    expect(a.token).not.toBe(b.token);
    expect(a.serviceId).toBe(s.id);
    expect(a.defaultEnvironment).toBe("PROD");
  });
  it("finds an enabled source by token, not a disabled/unknown one", async () => {
    const s = await seedService();
    const a = await createIngestSource({ scope: "SERVICE", serviceId: s.id, label: "x", defaultEnvironment: "PROD" });
    expect((await findIngestSourceByToken(a.token))?.id).toBe(a.id);
    expect(await findIngestSourceByToken("nope")).toBeNull();
    await prisma.ingestSource.update({ where: { id: a.id }, data: { enabled: false } });
    expect(await findIngestSourceByToken(a.token)).toBeNull();
  });
  it("lists and deletes a service's sources", async () => {
    const s = await seedService();
    const a = await createIngestSource({ scope: "SERVICE", serviceId: s.id, label: "x", defaultEnvironment: "PROD" });
    expect(await listIngestSources(s.id)).toHaveLength(1);
    await deleteIngestSource(a.id);
    expect(await listIngestSources(s.id)).toHaveLength(0);
  });
});
