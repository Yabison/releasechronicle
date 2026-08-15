import { describe, it, expect } from "vitest";
import { TRANSITION_OPTIONS, transitionKey, transitionMatches } from "@/lib/hooks/transitions";

describe("TRANSITION_OPTIONS", () => {
  it("is the adjacent forward pairs in order", () => {
    expect(TRANSITION_OPTIONS).toEqual([
      "SCHEDULED>GO_CONFIRMED",
      "GO_CONFIRMED>PENDING",
      "PENDING>IN_PROGRESS",
      "IN_PROGRESS>DEPLOYED",
      "DEPLOYED>TESTING",
      "TESTING>VALIDATE",
    ]);
  });
});

describe("transitionKey", () => {
  it("joins with '>'", () => {
    expect(transitionKey("DEPLOYED", "TESTING")).toBe("DEPLOYED>TESTING");
  });
});

describe("transitionMatches", () => {
  it("empty filter passes any transition", () => {
    expect(transitionMatches([], "DEPLOYED", "TESTING")).toBe(true);
    expect(transitionMatches([], null, null)).toBe(true);
  });
  it("passes a listed transition", () => {
    expect(transitionMatches(["DEPLOYED>TESTING"], "DEPLOYED", "TESTING")).toBe(true);
  });
  it("skips an unlisted transition", () => {
    expect(transitionMatches(["DEPLOYED>TESTING"], "IN_PROGRESS", "DEPLOYED")).toBe(false);
  });
  it("skips when from/to is null and the filter is non-empty", () => {
    expect(transitionMatches(["DEPLOYED>TESTING"], null, "TESTING")).toBe(false);
    expect(transitionMatches(["DEPLOYED>TESTING"], "DEPLOYED", undefined)).toBe(false);
  });
});
