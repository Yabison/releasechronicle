import { describe, it, expect } from "vitest";
import { median, computeDora } from "@/lib/dora";

const H = 3600_000, D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

describe("median", () => {
  it("returns null for empty", () => expect(median([])).toBeNull());
  it("odd length", () => expect(median([3, 1, 2])).toBe(2));
  it("even length averages the middle two", () => expect(median([1, 2, 3, 4])).toBe(2.5));
});

describe("computeDora", () => {
  it("counts deployments and per-day rate", () => {
    const base = 1_000_000_000_000;
    const deploys = [
      { occurredAt: iso(base), deployedAt: iso(base + 2 * H), rolledBack: false },
      { occurredAt: iso(base + D), deployedAt: iso(base + D + 30 * 60_000), rolledBack: true },
    ];
    const m = computeDora(deploys, [], 30);
    expect(m.deploy.count).toBe(2);
    expect(m.deploy.perDay).toBeCloseTo(2 / 30);
    expect(m.leadTime.medianMs).toBe(median([2 * H, 30 * 60_000]));
    expect(m.leadTime.sample).toBe(2);
    expect(m.changeFailure.failures).toBe(1);
    expect(m.changeFailure.total).toBe(2);
    expect(m.changeFailure.rate).toBeCloseTo(0.5);
  });

  it("lead time only over deployments that reached DEPLOYED", () => {
    const base = 1_000_000_000_000;
    const deploys = [
      { occurredAt: iso(base), deployedAt: iso(base + H), rolledBack: false },
      { occurredAt: iso(base + D), deployedAt: null, rolledBack: false },
    ];
    const m = computeDora(deploys, [], 30);
    expect(m.leadTime.sample).toBe(1);
    expect(m.leadTime.medianMs).toBe(H);
  });

  it("MTTR median over resolved incidents", () => {
    const base = 1_000_000_000_000;
    const incidents = [
      { startedAt: iso(base), resolvedAt: iso(base + 2 * H) },
      { startedAt: iso(base + D), resolvedAt: null },
    ];
    const m = computeDora([], incidents, 30);
    expect(m.mttr.sample).toBe(1);
    expect(m.mttr.medianMs).toBe(2 * H);
  });

  it("empty inputs → null metrics and na bands", () => {
    const m = computeDora([], [], 30);
    expect(m.deploy.count).toBe(0);
    expect(m.leadTime.medianMs).toBeNull();
    expect(m.changeFailure.rate).toBeNull();
    expect(m.mttr.medianMs).toBeNull();
    expect(m.leadTime.band).toBe("na");
    expect(m.mttr.band).toBe("na");
    expect(m.changeFailure.band).toBe("na");
  });

  it("bands: fast lead time = elite, low failure = elite", () => {
    const base = 1_000_000_000_000;
    const deploys = Array.from({ length: 30 }, (_, i) => ({
      occurredAt: iso(base + i * D), deployedAt: iso(base + i * D + 10 * 60_000), rolledBack: false,
    }));
    const m = computeDora(deploys, [], 30);
    expect(m.deploy.band).toBe("elite");
    expect(m.leadTime.band).toBe("elite");
    expect(m.changeFailure.band).toBe("elite");
  });
});
