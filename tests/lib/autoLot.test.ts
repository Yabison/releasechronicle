import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent } from "@/lib/events";
import { attachToAutoLot } from "@/lib/autoLot";
import { deleteService } from "@/lib/hierarchyDelete";

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
  it("does not group a deployment whose service has been soft-deleted", async () => {
    const { sMaster, sDep } = await setup();
    const base = new Date("2026-08-08T10:00:00Z");
    const m = await deploy(sMaster, base, "1.0.0");
    const d = await deploy(sDep, new Date(base.getTime() + 10 * 60_000), "2.0.0");
    await deleteService(sMaster);
    const r = await attachToAutoLot(d.id, new Date(base.getTime() + 10 * 60_000));
    expect(r.members).toBe(1);
    const rows = await prisma.event.findMany({ where: { id: { in: [m.id, d.id] } } });
    expect(rows.every((e) => !e.autoLot)).toBe(true);
  });

  /**
   * The candidate query only filters OTHER rows' services, so the triggering event's
   * own service needs its own guard. It takes TWO groupable live siblings to show why:
   * with only one candidate no lot ever forms, so the guard looks redundant. With two,
   * removing it lets a dead-service event group them — verified by reverting the guard,
   * which flips both rows to autoLot: true.
   */
  it("is a no-op on an event whose own service was soft-deleted, leaving live siblings ungrouped", async () => {
    const c = await createCompany({ name: "Acme" });
    const pMaster = await createProduct({ companyId: c.id, name: "Core" });
    const pLive = await createProduct({ companyId: c.id, name: "Widget" });
    const pDead = await createProduct({ companyId: c.id, name: "Gone" });
    const sMaster = await createService({ productId: pMaster.id, name: "Core", type: "API" });
    const sLive = await createService({ productId: pLive.id, name: "Widget", type: "API" });
    const sDead = await createService({ productId: pDead.id, name: "Gone", type: "API" });
    await prisma.service.update({ where: { id: sMaster.id }, data: { isMaster: true } });
    await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });

    const base = new Date("2026-08-08T10:00:00Z");
    const m = await deploy(sMaster.id, base, "1.0.0");
    const live = await deploy(sLive.id, new Date(base.getTime() + 5 * 60_000), "2.0.0");
    const dead = await deploy(sDead.id, new Date(base.getTime() + 6 * 60_000), "3.0.0");
    await deleteService(sDead.id);

    const r = await attachToAutoLot(dead.id, new Date(base.getTime() + 6 * 60_000));
    expect(r.members).toBe(1);
    const rows = await prisma.event.findMany({
      where: { id: { in: [m.id, live.id] } }, orderBy: { occurredAt: "asc" },
    });
    expect(rows.map((e) => e.autoLot)).toEqual([false, false]);
    expect(rows.map((e) => e.lot)).toEqual(["1.0.0", "2.0.0"]);
  });
});

// The sweeper calls attachToAutoLot once per deployment of the last 7 days, so a
// per-candidate membership count makes the sweep quadratic in the number of
// deployments. One grouped count for the whole window keeps it linear.
describe("attachToAutoLot membership counting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts lot membership for the whole window at once, not once per candidate", async () => {
    const { sMaster, sDep } = await setup();
    const base = new Date("2026-08-08T10:00:00Z");
    for (let i = 0; i < 4; i++) {
      await deploy(i % 2 ? sDep : sMaster, new Date(base.getTime() + i * 60_000), `1.0.${i}`);
    }
    const last = await deploy(sDep, new Date(base.getTime() + 5 * 60_000), "1.0.4");
    const count = vi.spyOn(prisma.event, "count");

    const r = await attachToAutoLot(last.id, new Date(base.getTime() + 5 * 60_000));

    expect(r.members).toBe(5);
    // One count remains: the early "is my own lot already a manual multi-member
    // lot?" check. What must not scale with the candidate count is the rest.
    expect(count.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
