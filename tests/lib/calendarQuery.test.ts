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
