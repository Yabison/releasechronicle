import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { detectRollbackOnIngest } from "@/lib/rollbackDetect";

let serviceId: string;
async function setup() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "Checkout API", type: "APP" });
  serviceId = s.id;
}
function deploy(build: string | null, minutesAgo: number, env = "PROD") {
  return createEvent({
    serviceId, environment: env, type: "DEPLOYMENT",
    occurredAt: new Date(Date.now() - minutesAgo * 60_000), tags: [],
    fields: { version: build, requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: build ?? "x" },
  });
}
beforeEach(async () => { await resetDb(); await setup(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("detectRollbackOnIngest", () => {
  async function tagsOf(id: string) {
    return (await prisma.event.findUnique({ where: { id }, select: { tags: true } }))?.tags ?? [];
  }

  it("tags the reverted higher build when a lower build follows", async () => {
    await deploy("100", 30);            // b1
    const high = await deploy("200", 20); // b2 > b1
    const low = await deploy("150", 10);  // b3 < b2 -> rollback of b2
    const res = await detectRollbackOnIngest(low.id);
    expect(res.flagged).toBe(high.id);
    expect(await tagsOf(high.id)).toContain("rollback");
    expect(await tagsOf(low.id)).not.toContain("rollback");
  });

  it("does nothing when the build keeps rising", async () => {
    await deploy("100", 20);
    const b = await deploy("200", 10);
    const res = await detectRollbackOnIngest(b.id);
    expect(res.flagged).toBeNull();
    expect(await tagsOf(b.id)).not.toContain("rollback");
  });

  it("is idempotent", async () => {
    const high = await deploy("200", 20);
    const low = await deploy("150", 10);
    await detectRollbackOnIngest(low.id);
    await detectRollbackOnIngest(low.id);
    expect((await tagsOf(high.id)).filter((t) => t === "rollback")).toHaveLength(1);
  });

  it("is a no-op for non-numeric versions", async () => {
    const high = await deploy("release-b", 20);
    const low = await deploy("release-a", 10);
    const res = await detectRollbackOnIngest(low.id);
    expect(res.flagged).toBeNull();
    expect(await tagsOf(high.id)).not.toContain("rollback");
  });

  it("scopes to the same environment", async () => {
    await deploy("200", 20, "PREPROD");
    const low = await deploy("150", 10, "PROD");
    const res = await detectRollbackOnIngest(low.id);
    expect(res.flagged).toBeNull();
  });

  it("links the new (rollback) deployment to the release it reverts", async () => {
    await deploy("100", 30);
    const high = await deploy("200", 20);
    const low = await deploy("150", 10);
    await detectRollbackOnIngest(low.id);
    const updatedLow = await prisma.event.findUnique({ where: { id: low.id } });
    expect(updatedLow?.causedById).toBe(high.id);
  });
});
