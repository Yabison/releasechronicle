import { describe, it, expect } from "vitest";
import { detectRollbacks, ROLLBACK_ENVIRONMENTS, type BuildPoint } from "../../prisma/seed/rollbacks";

const T0 = new Date("2026-05-01T08:00:00Z").getTime();

const point = (id: string, build: string | null, minutes: number, over: Partial<BuildPoint> = {}): BuildPoint => ({
  id,
  serviceId: "svc-api",
  environment: "RUN",
  at: new Date(T0 + minutes * 60_000),
  build,
  ...over,
});

describe("detectRollbacks", () => {
  it("flags the build that was reverted, not the one that replaced it", () => {
    const flagged = detectRollbacks([point("a", "100", 0), point("b", "101", 10), point("c", "100", 20)]);

    // 101 went out then 100 came back: 101 is what was rolled back.
    expect([...flagged]).toEqual(["b"]);
  });

  it("leaves a normal forward sequence alone", () => {
    expect(detectRollbacks([point("a", "100", 0), point("b", "101", 10)]).size).toBe(0);
  });

  it("reasons per service and per environment, not across them", () => {
    const flagged = detectRollbacks([
      point("a", "101", 0),
      point("b", "100", 10, { serviceId: "svc-other" }),
      point("c", "100", 20, { environment: "SECURE" }),
    ]);

    expect(flagged.size).toBe(0);
  });

  it("ignores a revision it cannot order", () => {
    const flagged = detectRollbacks([point("a", "2026.07.06-96550", 0), point("b", null, 10)]);

    expect(flagged.size).toBe(0);
  });

  it("orders by time, not by the order rows happened to arrive in", () => {
    const flagged = detectRollbacks([point("c", "100", 20), point("a", "100", 0), point("b", "101", 10)]);

    expect([...flagged]).toEqual(["b"]);
  });

  /**
   * The heuristic only holds where going backwards means someone reverted. On an
   * integration environment, builds are redeployed out of order all day long — PR
   * builds, feature branches, a rerun of yesterday's build — and reading that as a
   * rollback mislabels roughly one deployment in eight.
   */
  it("stays out of environments where builds legitimately go backwards", () => {
    const flagged = detectRollbacks([
      point("a", "101", 0, { environment: "AZER" }),
      point("b", "100", 10, { environment: "AZER" }),
    ]);

    expect(flagged.size).toBe(0);
  });

  it("covers every production-facing environment", () => {
    expect([...ROLLBACK_ENVIRONMENTS].sort()).toEqual(["DEMO", "PROD", "RUN", "SECURE"]);

    for (const environment of ROLLBACK_ENVIRONMENTS) {
      const flagged = detectRollbacks([
        point("a", "101", 0, { environment }),
        point("b", "100", 10, { environment }),
      ]);
      expect(flagged, environment).toEqual(new Set(["a"]));
    }
  });
});
