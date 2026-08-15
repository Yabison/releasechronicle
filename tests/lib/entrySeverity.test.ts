import { describe, it, expect } from "vitest";
import { entrySeverity } from "@/lib/eventTimeline";
import type { TimelineEntry } from "@/lib/eventTimeline";

function entry(over: Partial<TimelineEntry>): TimelineEntry {
  return {
    id: "e", eventId: "e", category: "DEPLOY", environment: "PROD",
    at: "2026-06-20T14:10:00.000Z", version: "1.0.0", title: "t", done: false,
    endAt: null, deployStatus: "DEPLOYED", rolledBack: false, lot: null,
    ...over,
  };
}

describe("entrySeverity", () => {
  it("healthy deployment → none", () => {
    expect(entrySeverity(entry({ deployStatus: "DEPLOYED" }))).toBeNull();
    expect(entrySeverity(entry({ deployStatus: "VALIDATE" }))).toBeNull();
  });

  it("rolled-back deployment → red", () => {
    expect(entrySeverity(entry({ rolledBack: true }))).toBe("red");
  });

  it("pending deployment → orange", () => {
    expect(entrySeverity(entry({ deployStatus: "PENDING" }))).toBe("orange");
  });

  it("warnPre deployment → orange", () => {
    expect(entrySeverity(entry({ deployStatus: "DEPLOYED", warnPre: true }))).toBe("orange");
  });

  it("rollback wins over a pending/warn state → red", () => {
    expect(entrySeverity(entry({ deployStatus: "PENDING", warnPre: true, rolledBack: true }))).toBe("red");
  });

  it("hotfix follows the same deployment rules", () => {
    expect(entrySeverity(entry({ category: "HOTFIX", rolledBack: true }))).toBe("red");
  });

  it("open incident → red, resolved incident → none", () => {
    expect(entrySeverity(entry({ category: "INCIDENT", done: false }))).toBe("red");
    expect(entrySeverity(entry({ category: "INCIDENT", done: true }))).toBeNull();
  });

  it("maintenance → none", () => {
    expect(entrySeverity(entry({ category: "MAINTENANCE" }))).toBeNull();
  });
});
