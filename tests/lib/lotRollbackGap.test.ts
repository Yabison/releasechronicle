import { describe, it, expect } from "vitest";
import { lotRollbackGap, lotRollbackWarnings, type LotMember } from "@/lib/deployLot";

function member(p: Partial<LotMember> & { service: string }): LotMember {
  return {
    eventId: `e-${p.service}`,
    company: "acme",
    product: "shop",
    version: "1.0.0",
    environment: "PROD",
    deployStatus: "DEPLOYED",
    isMaster: false,
    rolledBack: false,
    ...p,
  };
}

describe("lotRollbackGap", () => {
  it("no master → no warning", () => {
    expect(lotRollbackGap([member({ service: "api" }), member({ service: "web" })])).toEqual([]);
  });

  it("master not rolled back → no warning", () => {
    const members = [
      member({ service: "main", isMaster: true, rolledBack: false }),
      member({ service: "api", rolledBack: false }),
    ];
    expect(lotRollbackGap(members)).toEqual([]);
  });

  it("master rolled back, all others too → no warning", () => {
    const members = [
      member({ service: "main", isMaster: true, rolledBack: true }),
      member({ service: "api", rolledBack: true }),
      member({ service: "web", rolledBack: true }),
    ];
    expect(lotRollbackGap(members)).toEqual([]);
  });

  it("master rolled back, some others not → lists the ones not rolled back", () => {
    const members = [
      member({ service: "main", isMaster: true, rolledBack: true }),
      member({ service: "api", product: "shop", rolledBack: false }),
      member({ service: "web", product: "shop", rolledBack: true }),
      member({ service: "worker", product: "jobs", rolledBack: false }),
    ];
    expect(lotRollbackGap(members)).toEqual(["shop/api", "jobs/worker"]);
  });

  it("solo master rollback → no warning (no other members)", () => {
    expect(lotRollbackGap([member({ service: "main", isMaster: true, rolledBack: true })])).toEqual([]);
  });
});

describe("lotRollbackWarnings", () => {
  it("keeps only lots with a gap", () => {
    const clean = [
      member({ service: "main", isMaster: true, rolledBack: true }),
      member({ service: "api", rolledBack: true }),
    ];
    const gap = [
      member({ service: "main", isMaster: true, rolledBack: true }),
      member({ service: "api", rolledBack: false }),
    ];
    const out = lotRollbackWarnings({ "PROD LOT-1": clean, "PROD LOT-2": gap });
    expect(out).toEqual({ "PROD LOT-2": ["shop/api"] });
  });
});
