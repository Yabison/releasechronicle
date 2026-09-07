import { describe, it, expect } from "vitest";
import {
  stampDay, stampTime, stampShort, stampFull, dayKey, monthKey, monthLabel,
  toDatetimeInput, fromDatetimeInput,
} from "@/lib/dateDisplay";

// 21:30 UTC on July 31st = 23:30 in Paris (UTC+2 in summer): the instant sits on
// opposite sides of both a day and a month boundary depending on the timezone,
// which is exactly what the display bug conflated.
const ISO = "2026-07-31T21:30:00.000Z";
const utc = { mode: "utc" as const };
const paris = { mode: "local" as const, timeZone: "Europe/Paris" };

describe("stamps", () => {
  it("formats the same instant differently per timezone", () => {
    expect(stampShort(ISO, utc)).toBe("31/07 21:30");
    expect(stampShort(ISO, paris)).toBe("31/07 23:30");
  });
  it("crosses the day boundary where the timezone does", () => {
    const iso = "2026-07-31T22:30:00.000Z"; // 00:30 on Aug 1st in Paris
    expect(stampDay(iso, utc)).toBe("31/07");
    expect(stampDay(iso, paris)).toBe("01/08");
    expect(stampTime(iso, paris)).toBe("00:30");
  });
  it("full stamp carries the year, and names UTC so the reader knows", () => {
    expect(stampFull(ISO, utc)).toBe("31/07/2026 21:30 UTC");
    expect(stampFull(ISO, paris)).toBe("31/07/2026 23:30");
  });
});

describe("grouping keys", () => {
  const iso = "2026-07-31T22:30:00.000Z";
  it("dayKey follows the display timezone", () => {
    expect(dayKey(iso, utc)).toBe("2026-07-31");
    expect(dayKey(iso, paris)).toBe("2026-08-01");
  });
  it("monthKey follows too, so a row never sits under the wrong month header", () => {
    expect(monthKey(iso, utc)).toBe("2026-07");
    expect(monthKey(iso, paris)).toBe("2026-08");
  });
  it("monthLabel localizes", () => {
    expect(monthLabel(iso, { ...paris, locale: "fr" })).toBe("août 2026");
    expect(monthLabel(iso, { ...utc, locale: "en" })).toBe("July 2026");
  });
});

describe("datetime-local inputs", () => {
  it("renders the instant in the chosen timezone", () => {
    expect(toDatetimeInput(ISO, utc)).toBe("2026-07-31T21:30");
    expect(toDatetimeInput(ISO, paris)).toBe("2026-07-31T23:30");
  });
  it("parses a UTC-mode input back to the right instant", () => {
    expect(new Date(fromDatetimeInput("2026-07-31T21:30", "utc")).toISOString()).toBe(ISO);
  });
  it("round-trips in local mode on whatever timezone this machine has", () => {
    const input = toDatetimeInput(ISO, { mode: "local" });
    expect(new Date(fromDatetimeInput(input, "local")).toISOString()).toBe(ISO);
  });
});
