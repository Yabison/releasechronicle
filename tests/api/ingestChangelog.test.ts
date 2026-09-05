import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { POST } from "@/app/api/v1/deployments/route";
import { getChangelog, setManualChangelog } from "@/lib/changelog";

const HEADERS = { authorization: "Bearer test-token", "content-type": "application/json" };

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seed() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  await prisma.environmentConfig.create({ data: { slug: "QA", name: "QA", color: "#3b82f6", sortOrder: 1 } });
  return s.id;
}

const body = (over: Record<string, unknown> = {}) => JSON.stringify({
  company: "acme", product: "checkout", service: "api", environment: "PROD",
  version: "1.0.0", requester: "ci", changeType: "NORMAL", ...over,
});
const post = (b: string) =>
  POST(new Request("http://x/api/v1/deployments", { method: "POST", headers: HEADERS, body: b }));

describe("deployment ingest with a changelog", () => {
  it("stores the note against (service, version)", async () => {
    const serviceId = await seed();
    const res = await post(body({ changelog: "### Ajouté\n- le tri" }));
    expect(res.status).toBe(201);
    expect((await getChangelog(serviceId, "1.0.0"))?.body).toContain("le tri");
  });

  it("stores nothing when the field is absent", async () => {
    const serviceId = await seed();
    await post(body());
    expect(await getChangelog(serviceId, "1.0.0")).toBeNull();
  });

  it("treats an empty string as absent, so a CI cannot wipe a note", async () => {
    const serviceId = await seed();
    await post(body({ changelog: "la note" }));
    await post(body({ environment: "QA", changelog: "" }));
    expect((await getChangelog(serviceId, "1.0.0"))?.body).toBe("la note");
  });

  it("keeps a hand-edited note when the version is promoted", async () => {
    const serviceId = await seed();
    await post(body({ changelog: "de la CI" }));
    await setManualChangelog(serviceId, "1.0.0", "corrigée à la main", "Hervé");

    const res = await post(body({ environment: "QA", changelog: "de la CI, encore" }));

    expect(res.status).toBe(201);
    const row = await getChangelog(serviceId, "1.0.0");
    expect(row?.body).toBe("corrigée à la main");
    expect(row?.source).toBe("UI");
  });

  it("refuses a body over the cap without creating the event", async () => {
    await seed();
    const res = await post(body({ changelog: "x".repeat(20_001) }));
    expect(res.status).toBe(400);
    expect(await prisma.event.count()).toBe(0);
  });

  it("stores nothing for a phase deployment, which carries no version", async () => {
    const serviceId = await seed();
    const parent = await post(body({ changelog: "la note" }));
    const parentId = (await parent.json()).id;

    await post(body({ version: undefined, changeType: "PRE_MEP", parentId, changelog: "une phase" }));

    expect(await prisma.changelog.findMany({ where: { serviceId, version: "" } })).toHaveLength(0);
  });
});
