import { describe, it, expect } from "vitest";
import { buildCalendar } from "@/lib/ics";

describe("buildCalendar", () => {
  it("wraps events in a VCALENDAR with CRLF", () => {
    const ics = buildCalendar([], new Date("2026-08-07T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
  });
  it("emits a VEVENT with UTC basic-format dates and escaped text", () => {
    const ics = buildCalendar([{
      uid: "e1@rc",
      start: new Date("2026-08-07T14:30:00Z"),
      end: new Date("2026-08-07T15:00:00Z"),
      summary: "[MEP] acme/api; v1,2",
      description: "line1\nline2",
    }], new Date("2026-08-07T10:00:00Z"));
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:e1@rc");
    expect(ics).toContain("DTSTART:20260807T143000Z");
    expect(ics).toContain("DTEND:20260807T150000Z");
    expect(ics).toContain("SUMMARY:[MEP] acme/api\\; v1\\,2");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
    expect(ics).toContain("END:VEVENT");
  });
});
