import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Payment API")).toBe("payment-api");
  });
  it("strips accents and punctuation", () => {
    expect(slugify("Acmé, Inc.!")).toBe("acme-inc");
  });
  it("collapses repeated separators and trims", () => {
    expect(slugify("  a   b--c  ")).toBe("a-b-c");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when it is free", async () => {
    const result = await uniqueSlug("Checkout", async () => false);
    expect(result).toBe("checkout");
  });
  it("appends an incrementing suffix when taken", async () => {
    const taken = new Set(["checkout", "checkout-2"]);
    const result = await uniqueSlug("Checkout", async (s) => taken.has(s));
    expect(result).toBe("checkout-3");
  });
});
