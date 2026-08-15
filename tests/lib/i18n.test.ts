import { describe, it, expect } from "vitest";
import { getMessages, translate, isLocale, localeFromCookieValue, DEFAULT_LOCALE } from "@/i18n";

describe("i18n", () => {
  it("returns a catalog per locale, defaulting for unknown", () => {
    expect(getMessages("en")["nav.metrics"]).toBe("DORA metrics");
    expect(getMessages("fr")["nav.metrics"]).toBe("Métriques DORA");
  });
  it("translates a key with interpolation", () => {
    const en = getMessages("en");
    expect(translate(en, "metrics.windowDays", { days: 30 })).toBe("30 days");
    expect(translate(getMessages("fr"), "metrics.windowDays", { days: 90 })).toBe("90 jours");
  });
  it("falls back to the default-locale catalog then to the key", () => {
    // a key missing from en but present in fr → default (fr) value
    const partial = {} as Record<string, string>;
    expect(translate(partial, "nav.metrics")).toBe(getMessages(DEFAULT_LOCALE)["nav.metrics"]);
    expect(translate(partial, "totally.unknown.key")).toBe("totally.unknown.key");
  });
  it("validates and reads locales", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(localeFromCookieValue("en")).toBe("en");
    expect(localeFromCookieValue(null)).toBe(DEFAULT_LOCALE);
  });
});
