import { describe, it, expect } from "vitest";
import { defaultLotNumber } from "@/lib/lot";

describe("defaultLotNumber", () => {
  it("formats LOT-YYYYMMDD-HHmm from the given date", () => {
    expect(defaultLotNumber(new Date("2026-08-06T14:23:00"))).toBe("LOT-20260806-1423");
  });
  it("matches the pattern with the current date", () => {
    expect(defaultLotNumber()).toMatch(/^LOT-\d{8}-\d{4}$/);
  });
});
