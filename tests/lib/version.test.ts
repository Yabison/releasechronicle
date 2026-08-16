import { describe, it, expect } from "vitest";
import { bumpFor, nextVersion, rcVersion } from "@/lib/version";

describe("bumpFor", () => {
  it("is none without a releasable commit", () => {
    expect(bumpFor([], "0.1.0")).toBe("none");
    expect(bumpFor(["chore: tidy up", "test: add a case", "style: reformat"], "0.1.0")).toBe("none");
    expect(bumpFor(["not a conventional commit"], "0.1.0")).toBe("none");
  });

  it("is patch for fix and for the other visible types", () => {
    expect(bumpFor(["fix: off-by-one"], "0.1.0")).toBe("patch");
    expect(bumpFor(["perf: cache the query"], "0.1.0")).toBe("patch");
    expect(bumpFor(["docs: explain the flow"], "0.1.0")).toBe("patch");
    expect(bumpFor(["ci: pin the action"], "0.1.0")).toBe("patch");
  });

  it("is minor for feat, whatever the order", () => {
    expect(bumpFor(["feat: add tags"], "0.1.0")).toBe("minor");
    expect(bumpFor(["fix: a", "feat: b"], "0.1.0")).toBe("minor");
    expect(bumpFor(["feat: b", "fix: a"], "0.1.0")).toBe("minor");
  });

  it("reads scopes and the ! marker", () => {
    expect(bumpFor(["feat(login): panel"], "0.1.0")).toBe("minor");
    expect(bumpFor(["fix(api): 404"], "0.1.0")).toBe("patch");
  });

  // bump-minor-pre-major + bump-patch-for-minor-pre-major:false in
  // release-please-config.json: below 1.0.0 a breaking change is still a minor.
  it("keeps a breaking change to a minor below 1.0.0", () => {
    expect(bumpFor(["feat!: drop the old API"], "0.1.0")).toBe("minor");
    expect(bumpFor(["fix: a\n\nBREAKING CHANGE: gone"], "0.9.9")).toBe("minor");
  });

  it("makes a breaking change a major from 1.0.0 on", () => {
    expect(bumpFor(["feat!: drop the old API"], "1.2.3")).toBe("major");
    expect(bumpFor(["fix: a\n\nBREAKING CHANGE: gone"], "1.0.0")).toBe("major");
    expect(bumpFor(["refactor: x\n\nBREAKING-CHANGE: gone"], "2.0.0")).toBe("major");
  });

  it("ignores a BREAKING CHANGE that is not at the start of a line", () => {
    expect(bumpFor(["fix: mention BREAKING CHANGE: in passing"], "1.0.0")).toBe("patch");
  });
});

describe("nextVersion", () => {
  it("applies the bump", () => {
    expect(nextVersion("0.1.0", ["fix: a"])).toBe("0.1.1");
    expect(nextVersion("0.1.3", ["feat: a"])).toBe("0.2.0");
    expect(nextVersion("1.4.2", ["feat!: a"])).toBe("2.0.0");
    expect(nextVersion("1.4.2", ["feat: a"])).toBe("1.5.0");
    expect(nextVersion("1.4.2", ["fix: a"])).toBe("1.4.3");
  });

  it("leaves the version alone when nothing is releasable", () => {
    expect(nextVersion("0.1.0", ["chore: tidy"])).toBe("0.1.0");
    expect(nextVersion("0.1.0", [])).toBe("0.1.0");
  });
});

describe("rcVersion", () => {
  it("marks the version as a candidate", () => {
    expect(rcVersion("0.2.0")).toBe("0.2.0-rc");
  });

  // `-rc` is a semver prerelease identifier, so the string stays a valid version
  // and 0.2.0-rc ranks below 0.2.0 for anything that actually parses semver.
  it("produces a parseable prerelease", () => {
    expect(rcVersion("1.4.2")).toMatch(/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/);
  });
});
