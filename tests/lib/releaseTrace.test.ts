import { describe, it, expect } from "vitest";
import { traceRelease, workflowIssuesByEvent } from "@/lib/releaseTrace";

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
    expect(t.flaggedEnvs).toEqual([]);
  });

  it("flags a skipped workflow env, on the rows that came after the gap", () => {
    const events = [ev("AZER", "2026-08-01T10:00:00Z"), ev("PROD", "2026-08-03T10:00:00Z")];
    const t = traceRelease(events, "82080", ["AZER", "PREPROD", "PROD"]);
    expect(t.respected).toBe(false);
    expect(t.issues).toEqual([{ kind: "SKIPPED", environment: "PREPROD" }]);
    // AZER was deployed as expected; PROD is the step that jumped the gap.
    expect(t.flaggedEnvs).toEqual(["PROD"]);
  });

  it("flags an out-of-order deployment on the env that came too late", () => {
    const events = [
      ev("PREPROD", "2026-08-01T10:00:00Z"), // deployed to PREPROD before AZER
      ev("AZER", "2026-08-02T10:00:00Z"),
    ];
    const t = traceRelease(events, "82080", ["AZER", "PREPROD", "PROD"]);
    expect(t.respected).toBe(false);
    expect(t.issues).toEqual([{ kind: "OUT_OF_ORDER", environment: "AZER" }]);
    expect(t.flaggedEnvs).toEqual(["AZER"]);
  });

  it("returns respected=null when no workflow is defined", () => {
    const t = traceRelease([ev("AZER", "2026-08-01T10:00:00Z")], "82080", []);
    expect(t.respected).toBeNull();
    expect(t.steps).toHaveLength(1);
    expect(t.flaggedEnvs).toEqual([]);
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

describe("workflowIssuesByEvent", () => {
  it("attaches each version's violations to the deployments on its flagged envs", () => {
    const azerOk = ev("AZER", "2026-08-01T10:00:00Z");
    const prodSkip = ev("PROD", "2026-08-03T10:00:00Z");
    const prodSkipAgain = ev("PROD", "2026-08-04T10:00:00Z"); // redeploy of the same build: same problem
    const otherFine = ev("AZER", "2026-08-05T10:00:00Z", "99999");
    const incident = ev("PROD", "2026-08-06T10:00:00Z", "82080", "INCIDENT");
    const map = workflowIssuesByEvent([azerOk, prodSkip, prodSkipAgain, otherFine, incident], ["AZER", "PREPROD", "PROD"]);
    expect(map.get(azerOk.id)).toBeUndefined();
    expect(map.get(prodSkip.id)).toEqual([{ kind: "SKIPPED", environment: "PREPROD" }]);
    expect(map.get(prodSkipAgain.id)).toEqual([{ kind: "SKIPPED", environment: "PREPROD" }]);
    expect(map.get(otherFine.id)).toBeUndefined();
    expect(map.get(incident.id)).toBeUndefined();
  });

  it("is empty without a workflow or without versions", () => {
    expect(workflowIssuesByEvent([ev("PROD", "2026-08-01T10:00:00Z")], []).size).toBe(0);
    expect(workflowIssuesByEvent([ev("PROD", "2026-08-01T10:00:00Z", null)], ["AZER", "PROD"]).size).toBe(0);
  });
});
