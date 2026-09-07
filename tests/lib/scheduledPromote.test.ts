import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { promoteScheduledDeployments } from "@/lib/scheduledPromote";
import { deleteService } from "@/lib/hierarchyDelete";

async function svc() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  return (await createService({ productId: p.id, name: "API", type: "API" })).id;
}
async function scheduled(serviceId: string, scheduledAt: Date) {
  return createEvent({
    serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "GO_CONFIRMED", lot: "1.0.0", scheduledAt },
  });
}
beforeEach(async () => { await resetDb(); await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } }); });
afterAll(async () => { await prisma.$disconnect(); });

describe("promoteScheduledDeployments", () => {
  it("promotes a SCHEDULED deploy due within the lead window to PENDING", async () => {
    const s = await svc();
    const soon = new Date(Date.now() + 5 * 60_000);
    const ev = await scheduled(s, soon);
    const r = await promoteScheduledDeployments(new Date());
    expect(r.promoted).toBe(1);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).deployStatus).toBe("PENDING");
    const t = await prisma.statusTransition.findFirst({ where: { eventId: ev.id, toStatus: "PENDING" } });
    expect(t?.fromStatus).toBe("GO_CONFIRMED");
    expect(t?.actorName).toBe("scheduler");
  });
  it("does not promote a due deployment whose service has been soft-deleted", async () => {
    const s = await svc();
    const soon = new Date(Date.now() + 5 * 60_000);
    const ev = await scheduled(s, soon);
    await deleteService(s);
    const r = await promoteScheduledDeployments(new Date());
    expect(r.promoted).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).deployStatus).toBe("GO_CONFIRMED");
  });
  it("leaves a far-future SCHEDULED deploy untouched", async () => {
    const s = await svc();
    const ev = await scheduled(s, new Date(Date.now() + 60 * 60_000));
    const r = await promoteScheduledDeployments(new Date());
    expect(r.promoted).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).deployStatus).toBe("GO_CONFIRMED");
  });
});
