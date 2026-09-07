/**
 * What promoteScheduledDeployments does when the transition itself does not
 * succeed. Three outcomes that used to be one: the expected race, a real
 * database failure, and a row that vanished without throwing at all.
 *
 * transitionDeployStatus is replaced (the rest of @/lib/events stays real, so
 * createEvent still works) because none of the three can be provoked from a
 * single-threaded test otherwise.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return { ...actual, transitionDeployStatus: vi.fn() };
});

import { resetDb, prisma } from "../setup/db";
import { createCompany, createProduct, createService } from "@/lib/hierarchy";
import { createEvent, transitionDeployStatus, DeployTransitionError } from "@/lib/events";
import { promoteScheduledDeployments } from "@/lib/scheduledPromote";

const mockedTransition = vi.mocked(transitionDeployStatus);

async function dueDeployment() {
  const c = await createCompany({ name: "Acme" });
  const p = await createProduct({ companyId: c.id, name: "Checkout" });
  const s = await createService({ productId: p.id, name: "API", type: "API" });
  return createEvent({
    serviceId: s.id, environment: "PROD", type: "DEPLOYMENT", occurredAt: new Date(), tags: [],
    fields: {
      version: "1.0.0", requester: "ci", changeType: "NORMAL", deployStatus: "GO_CONFIRMED", lot: "1.0.0",
      scheduledAt: new Date(Date.now() + 5 * 60_000),
    },
  });
}

/** One stray non-JSON line on the stream must not turn an assertion into a SyntaxError. */
function records(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

let out: string[];
let err: string[];
const savedLevel = process.env.RC_LOG_LEVEL;

beforeEach(async () => {
  await resetDb();
  await prisma.environmentConfig.create({ data: { slug: "PROD", name: "PROD", color: "#22c55e", sortOrder: 0 } });
  out = [];
  err = [];
  mockedTransition.mockReset();
  vi.spyOn(console, "log").mockImplementation((s: unknown) => { out.push(String(s)); });
  vi.spyOn(console, "error").mockImplementation((s: unknown) => { err.push(String(s)); });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedLevel === undefined) delete process.env.RC_LOG_LEVEL;
  else process.env.RC_LOG_LEVEL = savedLevel;
});
afterAll(async () => { await prisma.$disconnect(); });

describe("promoteScheduledDeployments when the transition does not succeed", () => {
  it("treats a DeployTransitionError as the expected race, at debug", async () => {
    const ev = await dueDeployment();
    mockedTransition.mockRejectedValue(new DeployTransitionError("stale transition"));
    process.env.RC_LOG_LEVEL = "debug";

    const res = await promoteScheduledDeployments(new Date());

    expect(res).toEqual({ promoted: 0, ids: [], notifyFailed: [] });
    expect(err).toEqual([]); // debug goes to stdout, and nothing is an error here
    const rec = records(out).find((r) => r.eventId === ev.id);
    expect(rec?.level).toBe("debug");
    expect(rec?.msg).toContain("changed underneath us");
  });

  /**
   * The one that matters. Filing a dead connection under "row changed underneath
   * us" at debug level meant an exhausted pool produced the same silent
   * {promoted: 0} as a tick with nothing due.
   */
  it("reports a database failure as an error, not as a race", async () => {
    const ev = await dueDeployment();
    mockedTransition.mockRejectedValue(new Error("Timed out fetching a new connection from the pool"));

    const res = await promoteScheduledDeployments(new Date());

    expect(res.promoted).toBe(0);
    const rec = records(err).find((r) => r.eventId === ev.id);
    expect(rec).toBeDefined();
    expect(rec?.level).toBe("error");
    expect(rec?.msg).toBe("scheduled promotion failed");
    expect((rec?.err as { message: string }).message).toContain("connection from the pool");
  });

  /**
   * transitionDeployStatus returns null rather than throwing when the row is gone
   * or is not a deployment. Counting that as a promotion made the response name an
   * id that no longer existed.
   */
  it("does not count a row that vanished without throwing", async () => {
    const ev = await dueDeployment();
    mockedTransition.mockResolvedValue(null);

    const res = await promoteScheduledDeployments(new Date());

    expect(res).toEqual({ promoted: 0, ids: [], notifyFailed: [] });
    const rec = records(err).find((r) => r.eventId === ev.id);
    expect(rec?.level).toBe("warn");
    expect(rec?.msg).toContain("vanished");
  });
});
