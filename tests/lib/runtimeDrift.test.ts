import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { reportRuntimeBuild } from "@/lib/runtimeDrift";

let serviceId: string;
async function setup() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "Checkout API", type: "APP" });
  serviceId = s.id;
}
function deployed(build: string) {
  return createEvent({ serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: { version: build, requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: null } });
}
beforeEach(async () => { await resetDb(); await setup(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("reportRuntimeBuild", () => {
  it("no drift when the running build matches the last DEPLOYED", async () => {
    await deployed("100");
    const r = await reportRuntimeBuild({ serviceId, environment: "PROD", build: "100" });
    expect(r).toMatchObject({ drift: false, running: "100", expected: "100" });
    expect(await prisma.event.count({ where: { incidentType: "BUILD_DRIFT" } })).toBe(0);
  });

  it("opens a BUILD_DRIFT incident once on mismatch, resolves it when back in sync", async () => {
    await deployed("100");
    const drift = await reportRuntimeBuild({ serviceId, environment: "PROD", build: "099" });
    expect(drift.drift).toBe(true);
    expect(await prisma.event.count({ where: { incidentType: "BUILD_DRIFT", resolvedAt: null } })).toBe(1);
    // Idempotent: a second mismatch report doesn't duplicate the incident.
    await reportRuntimeBuild({ serviceId, environment: "PROD", build: "099" });
    expect(await prisma.event.count({ where: { incidentType: "BUILD_DRIFT" } })).toBe(1);
    // Back in sync → the incident is resolved.
    const ok = await reportRuntimeBuild({ serviceId, environment: "PROD", build: "100" });
    expect(ok.drift).toBe(false);
    expect(await prisma.event.count({ where: { incidentType: "BUILD_DRIFT", resolvedAt: null } })).toBe(0);
  });

  it("records the running build in RuntimeState", async () => {
    await reportRuntimeBuild({ serviceId, environment: "PROD", build: "77" });
    const rs = await prisma.runtimeState.findUnique({ where: { serviceId_environment: { serviceId, environment: "PROD" } } });
    expect(rs?.build).toBe("77");
  });
});
