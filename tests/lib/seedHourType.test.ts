import { describe, it, expect } from "vitest";
import { hourType } from "../../prisma/seed/hourType";

/**
 * The window is 09:00-18:00 Paris time, Monday to Friday. The interesting cases are
 * all about the offset: the rundeck export is UTC, so the boundary moves by an hour
 * between winter and summer, and a naive UTC comparison misfiles two hours a day.
 */
describe("hourType", () => {
  it("is HO in the middle of a working day", () => {
    // Monday 2026-01-05, 10:00 Paris (UTC+1).
    expect(hourType(new Date("2026-01-05T09:00:00Z"))).toBe("HO");
  });

  it("opens at 09:00 Paris in winter, not at 09:00 UTC", () => {
    expect(hourType(new Date("2026-01-05T08:00:00Z"))).toBe("HO"); // 09:00 Paris
    expect(hourType(new Date("2026-01-05T07:59:00Z"))).toBe("HNO"); // 08:59 Paris
  });

  it("opens at 09:00 Paris in summer too, an hour earlier in UTC", () => {
    // Wednesday 2026-07-01, Paris is UTC+2.
    expect(hourType(new Date("2026-07-01T07:00:00Z"))).toBe("HO"); // 09:00 Paris
    expect(hourType(new Date("2026-07-01T06:59:00Z"))).toBe("HNO"); // 08:59 Paris
  });

  it("closes at 18:00 Paris — 18:00 itself is already HNO", () => {
    expect(hourType(new Date("2026-07-01T15:59:00Z"))).toBe("HO"); // 17:59 Paris
    expect(hourType(new Date("2026-07-01T16:00:00Z"))).toBe("HNO"); // 18:00 Paris
  });

  it("is HNO all weekend, working hours or not", () => {
    expect(hourType(new Date("2026-06-20T12:00:00Z"))).toBe("HNO"); // Saturday
    expect(hourType(new Date("2026-06-21T12:00:00Z"))).toBe("HNO"); // Sunday
  });

  it("is HNO in the middle of the night", () => {
    expect(hourType(new Date("2026-01-05T02:00:00Z"))).toBe("HNO");
  });
});
