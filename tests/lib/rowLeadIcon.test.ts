import { describe, it, expect } from "vitest";
import { rowLeadIcon, type LeadIconInput } from "@/lib/rowLeadIcon";

const entry = (over: Partial<LeadIconInput> = {}): LeadIconInput => ({
  category: "DEPLOY",
  deployStatus: null,
  hasRollback: false,
  lotIncomplete: false,
  ...over,
});

describe("rowLeadIcon", () => {
  it("reads the deployment as a clock while nothing has started", () => {
    expect(rowLeadIcon(entry({ deployStatus: "SCHEDULED" }))).toBe("scheduled");
    expect(rowLeadIcon(entry({ deployStatus: "GO_CONFIRMED" }))).toBe("scheduled");
  });

  // Pending is the moment the deployment is due and has not moved: same clock,
  // no longer neutral.
  it("warns once it is pending", () => {
    expect(rowLeadIcon(entry({ deployStatus: "PENDING" }))).toBe("waiting");
  });

  // Deployed is not done: testing and validation still stand between it and a
  // finished release, so it keeps the in-flight glyph.
  it("keeps everything from in-progress to testing in flight", () => {
    expect(rowLeadIcon(entry({ deployStatus: "IN_PROGRESS" }))).toBe("running");
    expect(rowLeadIcon(entry({ deployStatus: "DEPLOYED" }))).toBe("running");
    expect(rowLeadIcon(entry({ deployStatus: "TESTING" }))).toBe("running");
  });

  it("closes on validate", () => {
    expect(rowLeadIcon(entry({ deployStatus: "VALIDATE" }))).toBe("validated");
  });

  it("uses the same status glyphs for a hotfix", () => {
    expect(rowLeadIcon(entry({ category: "HOTFIX", deployStatus: "PENDING" }))).toBe("waiting");
    expect(rowLeadIcon(entry({ category: "HOTFIX", deployStatus: "VALIDATE" }))).toBe("validated");
  });

  // The rule the feature exists for: a row reading DEPLOYED, or VALIDATE, that
  // rolled back or left a lot half-rolled-back is still flagged.
  it("lets danger override any status", () => {
    for (const deployStatus of ["SCHEDULED", "PENDING", "DEPLOYED", "VALIDATE"] as const) {
      expect(rowLeadIcon(entry({ deployStatus, hasRollback: true }))).toBe("danger");
      expect(rowLeadIcon(entry({ deployStatus, lotIncomplete: true }))).toBe("danger");
    }
  });

  it("falls back to the category when there is no deploy status", () => {
    expect(rowLeadIcon(entry({ category: "INCIDENT" }))).toBe("incident");
    expect(rowLeadIcon(entry({ category: "MAINTENANCE" }))).toBe("maintenance");
    expect(rowLeadIcon(entry({ category: "DEPLOY" }))).toBe("release");
    expect(rowLeadIcon(entry({ category: "HOTFIX" }))).toBe("hotfix");
  });

  it("always returns exactly one icon", () => {
    const statuses = [null, "SCHEDULED", "GO_CONFIRMED", "PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE"] as const;
    const all = (["DEPLOY", "HOTFIX", "INCIDENT", "MAINTENANCE"] as const).flatMap((category) =>
      statuses.flatMap((deployStatus) =>
        [true, false].flatMap((hasRollback) =>
          [true, false].map((lotIncomplete) => rowLeadIcon(entry({ category, deployStatus, hasRollback, lotIncomplete }))),
        ),
      ),
    );
    expect(all).toHaveLength(128);
    expect(all.every(Boolean)).toBe(true);
  });
});
