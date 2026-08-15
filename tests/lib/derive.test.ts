import { describe, it, expect } from "vitest";
import { maintenanceStatus, incidentDuration, currentByEnvironment, durationParts } from "@/lib/derive";

describe("durationParts", () => {
  it("breaks a span into days/hours/minutes/seconds with totals and a label", () => {
    const from = new Date("2026-06-20T10:00:00Z");
    const to = new Date("2026-06-22T13:04:05Z"); // 2d 3h 4m 5s
    const d = durationParts(from, to);
    expect(d).toMatchObject({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(d.totalSeconds).toBe(2 * 86400 + 3 * 3600 + 4 * 60 + 5);
    expect(d.totalMinutes).toBe(Math.floor(d.totalSeconds / 60));
    expect(d.label).toBe("2j 03h 04m 05s");
  });
  it("clamps negative spans to zero", () => {
    const d = durationParts(new Date("2026-06-20T10:00:00Z"), new Date("2026-06-20T09:00:00Z"));
    expect(d.totalSeconds).toBe(0);
    expect(d.label).toBe("00s");
  });
});

describe("maintenanceStatus", () => {
  const start = new Date("2026-06-25T10:00:00Z");
  const end = new Date("2026-06-25T11:00:00Z");
  it("is Upcoming before the window", () => {
    expect(maintenanceStatus(start, end, new Date("2026-06-25T09:00:00Z"))).toBe("Upcoming");
  });
  it("is InProgress inside the window (inclusive bounds)", () => {
    expect(maintenanceStatus(start, end, new Date("2026-06-25T10:30:00Z"))).toBe("InProgress");
    expect(maintenanceStatus(start, end, start)).toBe("InProgress");
    expect(maintenanceStatus(start, end, end)).toBe("InProgress");
  });
  it("is Complete after the window", () => {
    expect(maintenanceStatus(start, end, new Date("2026-06-25T11:30:00Z"))).toBe("Complete");
  });
});

describe("incidentDuration", () => {
  const started = new Date("2026-06-25T10:00:00Z");
  it("is open when unresolved, measured against now", () => {
    const r = incidentDuration(started, null, new Date("2026-06-25T10:30:00Z"));
    expect(r).toEqual({ minutes: 30, open: true });
  });
  it("is closed when resolved, measured against resolvedAt", () => {
    const r = incidentDuration(started, new Date("2026-06-25T10:45:00Z"), new Date("2026-06-25T12:00:00Z"));
    expect(r).toEqual({ minutes: 45, open: false });
  });
});

describe("currentByEnvironment", () => {
  it("keeps the latest deployment per environment by occurredAt", () => {
    const deploys = [
      { environment: "PROD", occurredAt: new Date("2026-06-25T08:00:00Z"), version: "1.0.0" },
      { environment: "PROD", occurredAt: new Date("2026-06-25T09:00:00Z"), version: "1.1.0" },
      { environment: "QA", occurredAt: new Date("2026-06-25T07:00:00Z"), version: "2.0.0" },
    ];
    const current = currentByEnvironment(deploys);
    expect(current.PROD.version).toBe("1.1.0");
    expect(current.QA.version).toBe("2.0.0");
    expect(Object.keys(current).sort()).toEqual(["PROD", "QA"]);
  });
  it("returns an empty object for no deployments", () => {
    expect(currentByEnvironment([])).toEqual({});
  });
});
