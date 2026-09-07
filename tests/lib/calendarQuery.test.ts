import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { queryCalendar, CALENDAR_ITEM_CAP } from "@/lib/calendarQuery";
import { log } from "@/lib/log";

const DAY = 86_400_000;

async function seedService() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  return s.id;
}
function deploy(serviceId: string, over: Record<string, unknown>) {
  return prisma.event.create({
    data: { serviceId, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), ...over },
  });
}

beforeEach(async () => { await resetDb(); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await prisma.$disconnect(); });

// A subscribed calendar does not need the whole history: a feed unbounded in time
// grows until it hits a silent row cap, which is the one truncation a subscriber
// cannot see.
describe("queryCalendar time window", () => {
  it("keeps events inside the default window", async () => {
    const serviceId = await seedService();
    await deploy(serviceId, { occurredAt: new Date(Date.now() - 30 * DAY), version: "recent" });
    await deploy(serviceId, { occurredAt: new Date(Date.now() + 200 * DAY), version: "upcoming" });

    const items = await queryCalendar({});

    expect(items.map((i) => i.summary).join(" ")).toContain("recent");
    expect(items.map((i) => i.summary).join(" ")).toContain("upcoming");
  });

  it("drops events older than the past bound", async () => {
    const serviceId = await seedService();
    await deploy(serviceId, { occurredAt: new Date(Date.now() - 2 * 365 * DAY), version: "ancient" });

    expect(await queryCalendar({})).toHaveLength(0);
  });

  it("drops events beyond the future bound", async () => {
    const serviceId = await seedService();
    await deploy(serviceId, { occurredAt: new Date(Date.now() + 2 * 365 * DAY), version: "far" });

    expect(await queryCalendar({})).toHaveLength(0);
  });

  it("keeps a maintenance whose window falls inside the future bound", async () => {
    const serviceId = await seedService();
    const start = new Date(Date.now() + 10 * DAY);
    // occurredAt is outside the past bound, but the window the subscriber cares
    // about is not: any of the three display dates inside the window keeps the row.
    await prisma.event.create({
      data: {
        serviceId, environment: "PROD", type: "MAINTENANCE",
        occurredAt: new Date(Date.now() - 2 * 365 * DAY),
        windowStart: start, windowEnd: new Date(start.getTime() + 3_600_000),
      },
    });

    expect(await queryCalendar({})).toHaveLength(1);
  });
});

describe("queryCalendar row cap", () => {
  it("warns when the safety cap truncates the feed", async () => {
    const serviceId = await seedService();
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    await prisma.event.createMany({
      data: Array.from({ length: CALENDAR_ITEM_CAP + 1 }, (_, i) => ({
        serviceId, environment: "PROD", type: "DEPLOYMENT" as const,
        occurredAt: new Date(Date.now() - i * 60_000), version: `1.0.${i}`,
      })),
    });

    const items = await queryCalendar({});

    expect(items).toHaveLength(CALENDAR_ITEM_CAP);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/truncat/i);
  });

  it("stays silent when the feed fits under the cap", async () => {
    const serviceId = await seedService();
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    await deploy(serviceId, { version: "1.0.0" });

    await queryCalendar({});

    expect(warn).not.toHaveBeenCalled();
  });
});

/** Same hierarchy as seedService, public end to end, for the publicScope tests. */
async function seedPublicService() {
  const c = await createCompany({ name: "Shop" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  await prisma.company.update({ where: { id: c.id }, data: { public: true } });
  await prisma.product.update({ where: { id: p.id }, data: { public: true } });
  await prisma.service.update({ where: { id: s.id }, data: { public: true } });
  return s.id;
}

function envGroup(slug: string, members: string[], over: Record<string, unknown> = {}) {
  return prisma.environmentGroup.create({
    data: { slug, name: slug.toUpperCase(), members, sortOrder: 0, ...over },
  });
}

/**
 * A group (ALLPROD = PROD + SECURE) is one filter value standing for several
 * environments. It must widen to its members and to nothing else -- and when the
 * group is gone, empty the feed rather than quietly fall back to "every
 * environment", which would leak the environments the group was there to exclude.
 */
describe("queryCalendar environment groups", () => {
  it("keeps the events of every member environment", async () => {
    const serviceId = await seedService();
    await envGroup("allprod", ["PROD", "SECURE"]);
    await deploy(serviceId, { environment: "PROD", version: "in-prod" });
    await deploy(serviceId, { environment: "SECURE", version: "in-secure" });
    await deploy(serviceId, { environment: "RECETTE", version: "in-recette" });

    const summaries = (await queryCalendar({ environment: "group:allprod" })).map((i) => i.summary).join(" ");

    expect(summaries).toContain("in-prod");
    expect(summaries).toContain("in-secure");
    expect(summaries).not.toContain("in-recette");
  });

  it("empties the feed and warns when the group has been deleted", async () => {
    const serviceId = await seedService();
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    await envGroup("allprod", ["PROD"], { deletedAt: new Date() });
    await deploy(serviceId, { environment: "PROD", version: "1.0.0" });

    const items = await queryCalendar({ environment: "group:allprod" });

    expect(items).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/environment group/i);
  });

  it("empties the feed and warns when the group has no member", async () => {
    const serviceId = await seedService();
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    await envGroup("empty", []);
    await deploy(serviceId, { environment: "PROD", version: "1.0.0" });

    expect(await queryCalendar({ environment: "group:empty" })).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("narrows a group to its public members in public mode", async () => {
    const serviceId = await seedPublicService();
    await envGroup("allprod", ["PROD", "SECURE"]);
    await deploy(serviceId, { environment: "PROD", version: "in-prod" });
    await deploy(serviceId, { environment: "SECURE", version: "in-secure" });

    const items = await queryCalendar({
      environment: "group:allprod",
      publicScope: { envs: ["PROD"], types: ["DEPLOYMENT"] },
    });

    expect(items.map((i) => i.summary).join(" ")).toContain("in-prod");
    expect(items.map((i) => i.summary).join(" ")).not.toContain("in-secure");
  });
});

/** Two services under one product, so a lot has something to group. */
async function seedLotServices() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const api = await createService({ productId: p.id, name: "API", type: "API" });
  const web = await createService({ productId: p.id, name: "Web", type: "APP" });
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  return { api: api.id, web: web.id };
}

/**
 * A lot is one release shipped across several apps. Ten VEVENT for one release is
 * noise in a calendar client, so `mergeLots` turns the lot into a single event
 * spanning its members and drops the per-service ones. A lot of one is left alone:
 * merging it would only rename an event nobody asked to rename.
 */
describe("queryCalendar lot merging", () => {
  it("collapses a lot's members into one event naming them all", async () => {
    const { api, web } = await seedLotServices();
    await deploy(api, { version: "2.1.0", lot: "release-08", deployStatus: "DEPLOYED" });
    await deploy(web, { version: "2.1.0", lot: "release-08", deployStatus: "DEPLOYED" });

    const items = await queryCalendar({ mergeLots: true });

    expect(items).toHaveLength(1);
    expect(items[0].summary).toContain("release-08");
    expect(items[0].summary).toContain("PROD");
    expect(items[0].description).toContain("checkout/api");
    expect(items[0].description).toContain("checkout/web");
  });

  it("spans from the first member to the last", async () => {
    const { api, web } = await seedLotServices();
    const first = new Date(Date.now() + 3 * DAY);
    const last = new Date(first.getTime() + 2 * 3_600_000);
    await deploy(api, { scheduledAt: first, version: "2.1.0", lot: "release-08" });
    await deploy(web, { scheduledAt: last, version: "2.1.0", lot: "release-08" });

    const [item] = await queryCalendar({ mergeLots: true });

    expect(item.start.getTime()).toBe(first.getTime());
    expect(item.end.getTime()).toBe(last.getTime() + 30 * 60_000);
  });

  it("keeps the per-service events when merging is off", async () => {
    const { api, web } = await seedLotServices();
    await deploy(api, { version: "2.1.0", lot: "release-08" });
    await deploy(web, { version: "2.1.0", lot: "release-08" });

    expect(await queryCalendar({})).toHaveLength(2);
  });

  it("leaves a lot of one member as its own service event", async () => {
    const { api } = await seedLotServices();
    await deploy(api, { version: "2.1.0", lot: "release-08" });

    const [item] = await queryCalendar({ mergeLots: true });

    expect(item.summary).toContain("checkout/api");
    expect(item.summary).toContain("2.1.0");
  });

  it("leaves a deployment without a lot alone", async () => {
    const { api, web } = await seedLotServices();
    await deploy(api, { version: "2.1.0", lot: "release-08" });
    await deploy(web, { version: "2.1.0", lot: "release-08" });
    await deploy(web, { version: "9.9.9" });

    const items = await queryCalendar({ mergeLots: true });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.summary).join(" ")).toContain("9.9.9");
  });

  it("keeps the same lot in two environments apart", async () => {
    const { api, web } = await seedLotServices();
    await deploy(api, { environment: "PROD", lot: "release-08" });
    await deploy(web, { environment: "PROD", lot: "release-08" });
    await deploy(api, { environment: "RECETTE", lot: "release-08" });
    await deploy(web, { environment: "RECETTE", lot: "release-08" });

    const items = await queryCalendar({ mergeLots: true });

    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.uid)).size).toBe(2);
  });

  it("labels the lot HOTFIX only when every member is one", async () => {
    const { api, web } = await seedLotServices();
    await deploy(api, { lot: "hf-1", changeType: "HOTFIX" });
    await deploy(web, { lot: "hf-1", changeType: "HOTFIX" });
    await deploy(api, { lot: "mixed", changeType: "HOTFIX" });
    await deploy(web, { lot: "mixed", changeType: "NORMAL" });

    const items = await queryCalendar({ mergeLots: true });
    const byLot = (lot: string) => items.find((i) => i.summary.includes(lot))!.summary;

    expect(byLot("hf-1")).toContain("[HOTFIX]");
    expect(byLot("mixed")).toContain("[MEP]");
  });

  it("leaves a maintenance carrying a lot as its own event", async () => {
    const { api, web } = await seedLotServices();
    await prisma.event.create({
      data: { serviceId: api, environment: "PROD", type: "MAINTENANCE", occurredAt: new Date(), lot: "release-08" },
    });
    await prisma.event.create({
      data: { serviceId: web, environment: "PROD", type: "MAINTENANCE", occurredAt: new Date(), lot: "release-08" },
    });

    const items = await queryCalendar({ mergeLots: true });

    expect(items).toHaveLength(2);
    expect(items.every((i) => i.summary.startsWith("[Maintenance]"))).toBe(true);
  });
});
