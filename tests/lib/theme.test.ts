import { describe, it, expect } from "vitest";
import { isTheme, themeFromCookieValue, DEFAULT_THEME, THEMES } from "@/lib/theme";

describe("isTheme", () => {
  it("accepts the three themes and nothing else", () => {
    for (const t of THEMES) expect(isTheme(t)).toBe(true);
    expect(isTheme("Dark")).toBe(false);
    expect(isTheme("solarized")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});

describe("themeFromCookieValue", () => {
  it("keeps a valid value", () => {
    expect(themeFromCookieValue("dark")).toBe("dark");
    expect(themeFromCookieValue("light")).toBe("light");
    expect(themeFromCookieValue("system")).toBe("system");
  });

  // The cookie is attacker-controlled: it lands in an HTML attribute, so a value
  // that is not one of the three must never reach the markup.
  it("falls back on anything else", () => {
    expect(themeFromCookieValue(null)).toBe(DEFAULT_THEME);
    expect(themeFromCookieValue(undefined)).toBe(DEFAULT_THEME);
    expect(themeFromCookieValue("")).toBe(DEFAULT_THEME);
    expect(themeFromCookieValue('dark" onload="alert(1)')).toBe(DEFAULT_THEME);
  });

  it("defaults to following the operating system", () => {
    expect(DEFAULT_THEME).toBe("system");
  });
});
