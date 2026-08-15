import { describe, it, expect } from "vitest";
import { traceRelease } from "@/lib/releaseTrace";

let n = 0;
const ev = (environment: string, occurredAt: string, version: string | null = "82080", type = "DEPLOYMENT") =>
  ({ id: `e${n++}`, type, version, environment, occurredAt, deployStatus: "DEPLOYED" });

describe("traceRelease", () => {
  it("follows a build across environments, earliest per env, chronological", () => {
    const events = [
      ev("PROD", "2026-08-03T10:00:00Z"),
      ev("AZER", "2026-08-01T10:00:00Z"),
      ev("PREPROD", "2026-08-02T10:00:00Z"),
      ev("AZER", "2026-08-01T12:00:00Z"), // later same env → ignored (keep earliest)
      ev("PROD", "2026-08-09T10:00:00Z", "99999"), // other build → ignored
    ];
    const t = traceRelease(events, "82080", ["AZER", "PREPROD", "PROD"]);
    expect(t.steps.map((s) => s.environment)).toEqual(["AZER", "PREPROD", "PROD"]);
    expect(t.steps[0].occurredAt).toBe("2026-08-01T10:00:00Z");
    expect(t.respected).toBe(true);
    expect(t.issues).toEqual([]);
  });

  it("flags a skipped workflow env", () => {
    const events = [ev("AZER", "2026-08-01T10:00:00Z"), ev("PROD", "2026-08-03T10:00:00Z")];
    const t = traceRelease(events, "82080", ["AZER", "PREPROD", "PROD"]);
    expect(t.respected).toBe(false);
    expect(t.issues).toContain("PREPROD sauté");
  });

  it("flags an out-of-order deployment", () => {
    const events = [
      ev("PREPROD", "2026-08-01T10:00:00Z"), // deployed to PREPROD before AZER
      ev("AZER", "2026-08-02T10:00:00Z"),
    ];
    const t = traceRelease(events, "82080", ["AZER", "PREPROD", "PROD"]);
    expect(t.respected).toBe(false);
    expect(t.issues.some((i) => i.includes("hors ordre"))).toBe(true);
  });

  it("returns respected=null when no workflow is defined", () => {
    const t = traceRelease([ev("AZER", "2026-08-01T10:00:00Z")], "82080", []);
    expect(t.respected).toBeNull();
    expect(t.steps).toHaveLength(1);
  });

  it("ignores envs outside the workflow when checking compliance", () => {
    const events = [
      ev("AZER", "2026-08-01T10:00:00Z"),
      ev("DEMO", "2026-08-02T10:00:00Z"), // not in workflow
      ev("PREPROD", "2026-08-03T10:00:00Z"),
      ev("PROD", "2026-08-04T10:00:00Z"),
    ];
    const t = traceRelease(events, "82080", ["AZER", "PREPROD", "PROD"]);
    expect(t.respected).toBe(true);
  });
});
