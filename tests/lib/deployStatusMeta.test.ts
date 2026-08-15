import { describe, it, expect } from "vitest";
import { DeployStatus } from "@prisma/client";
import { STATUS_META, ROLLBACK_COLOR } from "@/lib/deployStatusMeta";

describe("STATUS_META", () => {
  it("has a label and hex color for every DeployStatus", () => {
    for (const s of Object.values(DeployStatus)) {
      expect(STATUS_META[s]).toBeDefined();
      expect(STATUS_META[s].label).toBe(s);
      expect(STATUS_META[s].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("uses green for VALIDATE", () => {
    expect(STATUS_META.VALIDATE.color).toBe("#22c55e");
  });
  it("has SCHEDULED as its own entry", () => {
    expect(STATUS_META.SCHEDULED.label).toBe("SCHEDULED");
  });
});

describe("ROLLBACK_COLOR", () => {
  it("is red", () => {
    expect(ROLLBACK_COLOR).toBe("#ef4444");
  });
});
