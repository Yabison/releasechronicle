import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { attachToAutoLot } from "@/lib/autoLot";

async function setup(opts: { naming?: string } = {}) {
  const c = await createCompany({ name: "Acme" });
  if (opts.naming) await prisma.company.update({ where: { id: c.id }, data: { autoLotNaming: opts.naming } });
  const master = await createProduct({ companyId: c.id, name: "Core" });
  const dep = await createProduct({ companyId: c.id, name: "Widget" });
  const sMaster = await createService({ productId: master.id, name: "Core", type: "API" });
  const sDep = await createService({ productId: dep.id, name: "Widget", type: "API" });
  await prisma.service.update({ where: { id: sMaster.id }, data: { isMaster: true } });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  return { sMaster: sMaster.id, sDep: sDep.id };
}
function deploy(serviceId: string, at: Date, version: string) {
  return createEvent({ serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: at, tags: [],
    fields: { version, requester: "ci", changeType: "NORMAL", deployStatus: "DEPLOYED", lot: version } });
}
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("attachToAutoLot", () => {
  it("groups two deployments within the window into one auto-lot named after the master", async () => {
    const { sMaster, sDep } = await setup({ naming: "master" });
    const base = new Date("2026-08-08T10:00:00Z");
    const m = await deploy(sMaster, base, "1.0.0");
    const d = await deploy(sDep, new Date(base.getTime() + 10 * 60_000), "2.0.0");
    const r = await attachToAutoLot(d.id, new Date(base.getTime() + 10 * 60_000));
    expect(r.members).toBe(2);
    const rows = await prisma.event.findMany({ where: { id: { in: [m.id, d.id] } } });
    expect(new Set(rows.map((e) => e.lot)).size).toBe(1);
    expect(rows.every((e) => e.autoLot)).toBe(true);
    expect(rows[0].lot).toMatch(/^LOT-core-\d{8}-\d{4}$/);
  });
  it("does not group deployments outside the window", async () => {
    const { sMaster, sDep } = await setup();
    const base = new Date("2026-08-08T10:00:00Z");
    await deploy(sMaster, base, "1.0.0");
    const d = await deploy(sDep, new Date(base.getTime() + 90 * 60_000), "2.0.0");
    const r = await attachToAutoLot(d.id, new Date(base.getTime() + 90 * 60_000));
    expect(r.members).toBe(1);
  });
  it("uses the date form when naming=date (or no master present)", async () => {
    const { sMaster, sDep } = await setup({ naming: "date" });
    const base = new Date("2026-08-08T10:00:00Z");
    const m = await deploy(sMaster, base, "1.0.0");
    const d = await deploy(sDep, new Date(base.getTime() + 5 * 60_000), "2.0.0");
    await attachToAutoLot(d.id, new Date(base.getTime() + 5 * 60_000));
    const row = await prisma.event.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.lot).toMatch(/^LOT-AUTO-\d{8}-\d{4}$/);
  });
  it("leaves a manual multi-member lot untouched", async () => {
    const { sMaster, sDep } = await setup();
    const base = new Date("2026-08-08T10:00:00Z");
    const a = await deploy(sMaster, base, "REL-1");
    const b = await deploy(sDep, new Date(base.getTime() + 5 * 60_000), "REL-1");
    const r = await attachToAutoLot(b.id, new Date(base.getTime() + 5 * 60_000));
    expect(r.members).toBe(1);
    const rows = await prisma.event.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((e) => e.lot === "REL-1" && !e.autoLot)).toBe(true);
  });
});
