import { describe, it, expect } from "vitest";
import { buildUrl } from "@/lib/buildUrl";

describe("buildUrl", () => {
  it("substitutes {version}", () => {
    expect(buildUrl("https://ci/builds/{version}", "1.2.3")).toBe("https://ci/builds/1.2.3");
  });
  it("substitutes every occurrence", () => {
    expect(buildUrl("{version}/x/{version}", "9")).toBe("9/x/9");
  });
  it("returns null when the template is blank or absent", () => {
    expect(buildUrl(null, "1")).toBeNull();
    expect(buildUrl("   ", "1")).toBeNull();
    expect(buildUrl(undefined, "1")).toBeNull();
  });
  it("returns null when the version is blank or absent", () => {
    expect(buildUrl("https://ci/{version}", null)).toBeNull();
    expect(buildUrl("https://ci/{version}", "  ")).toBeNull();
  });
  it("returns the template unchanged when it has no {version}", () => {
    expect(buildUrl("https://ci/latest", "1.0.0")).toBe("https://ci/latest");
  });
});
