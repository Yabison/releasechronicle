import { describe, it, expect } from "vitest";
import { nonEmpty, optionalStr, optionalOrNull, isoDate, hexColor, tagsSchema, ignoredIfInvalid } from "@/lib/schemas/common";
import { z } from "zod";

describe("schema primitives", () => {
  it("nonEmpty trims, requires content, caps length", () => {
    expect(nonEmpty().parse("  x  ")).toBe("x");
    expect(nonEmpty().safeParse("   ").success).toBe(false);
    expect(nonEmpty(5).safeParse("abcdef").success).toBe(false);
  });
  it("optionalStr turns absent/blank into undefined, trims otherwise", () => {
    const s = z.object({ v: optionalStr() });
    expect(s.parse({}).v).toBeUndefined();
    expect(s.parse({ v: "  " }).v).toBeUndefined();
    expect(s.parse({ v: " a " }).v).toBe("a");
    expect(s.safeParse({ v: 5 }).success).toBe(false);
  });
  it("optionalOrNull yields null for absent/blank", () => {
    const s = z.object({ v: optionalOrNull() });
    expect(s.parse({}).v).toBeNull();
    expect(s.parse({ v: "" }).v).toBeNull();
    expect(s.parse({ v: " a " }).v).toBe("a");
  });
  it("isoDate parses valid strings to Date and rejects garbage", () => {
    expect(isoDate.parse("2026-06-25T09:00:00Z")).toEqual(new Date("2026-06-25T09:00:00Z"));
    expect(isoDate.safeParse("yesterday").success).toBe(false);
    expect(isoDate.safeParse(1234).success).toBe(false);
  });
  it("hexColor accepts #rrggbb only", () => {
    expect(hexColor.parse(" #A1b2C3 ")).toBe("#A1b2C3");
    expect(hexColor.safeParse("red").success).toBe(false);
  });
  it("tagsSchema caps count and entry length", () => {
    expect(tagsSchema.safeParse(Array(51).fill("t")).success).toBe(false);
    expect(tagsSchema.safeParse(["x".repeat(101)]).success).toBe(false);
    expect(tagsSchema.parse([" a "])).toEqual(["a"]);
  });
  it("ignoredIfInvalid swallows invalid values as undefined", () => {
    const s = z.object({ n: ignoredIfInvalid(z.number().int()) });
    expect(s.parse({ n: "nope" }).n).toBeUndefined();
    expect(s.parse({ n: 3 }).n).toBe(3);
  });
});
