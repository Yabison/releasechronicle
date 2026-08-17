import { describe, it, expect } from "vitest";
import { rowLeadIcon, type LeadIconInput } from "@/lib/rowLeadIcon";

const entry = (over: Partial<LeadIconInput> = {}): LeadIconInput => ({
  category: "DEPLOY",
  hasRollback: false,
  lotIncomplete: false,
  ...over,
});

describe("rowLeadIcon", () => {
  it("maps each category to its own glyph", () => {
    expect(rowLeadIcon(entry({ category: "DEPLOY" }))).toBe("release");
    expect(rowLeadIcon(entry({ category: "HOTFIX" }))).toBe("hotfix");
    expect(rowLeadIcon(entry({ category: "INCIDENT" }))).toBe("incident");
    expect(rowLeadIcon(entry({ category: "MAINTENANCE" }))).toBe("maintenance");
  });

  it("always returns exactly one icon", () => {
    const all = (["DEPLOY", "HOTFIX", "INCIDENT", "MAINTENANCE"] as const).flatMap((category) =>
      [true, false].flatMap((hasRollback) =>
        [true, false].map((lotIncomplete) => rowLeadIcon(entry({ category, hasRollback, lotIncomplete }))),
      ),
    );
    expect(all).toHaveLength(16);
    expect(all.every((icon) => icon !== null && icon !== undefined)).toBe(true);
  });

  // The rule the whole feature exists for: a deployment that reads "DEPLOYED"
  // but rolled back, or left a lot half-rolled-back, must still be flagged.
  it("lets danger override the category", () => {
    expect(rowLeadIcon(entry({ hasRollback: true }))).toBe("danger");
    expect(rowLeadIcon(entry({ lotIncomplete: true }))).toBe("danger");
    expect(rowLeadIcon(entry({ category: "HOTFIX", hasRollback: true }))).toBe("danger");
    expect(rowLeadIcon(entry({ category: "MAINTENANCE", lotIncomplete: true }))).toBe("danger");
  });

  // An open incident is already an incident: replacing its triangle with the
  // danger circle would say "this entry has a deployment problem", which is a
  // different claim. Rollback and incomplete-lot are what danger reports.
  it("leaves an incident showing the incident glyph", () => {
    expect(rowLeadIcon(entry({ category: "INCIDENT" }))).toBe("incident");
  });

  it("prefers danger over everything when both causes are present", () => {
    expect(rowLeadIcon(entry({ hasRollback: true, lotIncomplete: true }))).toBe("danger");
  });
});
