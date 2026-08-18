import { describe, it, expect } from "vitest";
import { getMessages, translate } from "@/i18n";
import { changeTypeLabel, phaseLabel, categoryLabel, actionMessage, rollbackText, CHANGE_TYPES } from "@/i18n/labels";

const tr = (locale: "fr" | "en") =>
  (key: string, vars?: Record<string, string | number>) => translate(getMessages(locale), key, vars);

describe("changeTypeLabel", () => {
  it("localizes every change type", () => {
    expect(changeTypeLabel(tr("fr"), "NORMAL")).toBe("RELEASE");
    expect(changeTypeLabel(tr("fr"), "PRE_MEP")).toBe("PRE-RELEASE");
    expect(changeTypeLabel(tr("fr"), "POST_MEP")).toBe("POST-RELEASE");
    expect(changeTypeLabel(tr("en"), "NORMAL")).toBe("RELEASE");
    expect(changeTypeLabel(tr("en"), "PRE_MEP")).toBe("PRE-RELEASE");
    expect(changeTypeLabel(tr("en"), "POST_MEP")).toBe("POST-RELEASE");
  });
  it("defaults a missing change type to NORMAL", () => {
    expect(changeTypeLabel(tr("fr"), null)).toBe("RELEASE");
    expect(changeTypeLabel(tr("en"), undefined)).toBe("RELEASE");
  });
  it("falls back to the raw value for an unknown change type", () => {
    expect(changeTypeLabel(tr("en"), "WHATEVER")).toBe("WHATEVER");
  });
  it("has a catalog entry for every known change type", () => {
    for (const ct of CHANGE_TYPES) {
      for (const loc of ["fr", "en"] as const) {
        expect(getMessages(loc)[`changeType.${ct}`], `${loc}/${ct}`).toBeTruthy();
      }
    }
  });
});

describe("phaseLabel", () => {
  it("gives the short PRE/POST badge per locale", () => {
    expect(phaseLabel(tr("fr"), "PRE")).toBe("PRE");
    expect(phaseLabel(tr("en"), "POST")).toBe("POST");
  });
});

describe("categoryLabel", () => {
  it("localizes timeline categories, unknown ones fall back", () => {
    expect(categoryLabel(tr("fr"), "DEPLOY")).toBe("RELEASE");
    expect(categoryLabel(tr("en"), "DEPLOY")).toBe("RELEASE");
    expect(categoryLabel(tr("en"), "NOPE")).toBe("NOPE");
  });
});

describe("actionMessage", () => {
  it("translates the error key", () => {
    expect(actionMessage(tr("en"), { error: "err.badDate" })).toBe("invalid date");
    expect(actionMessage(tr("fr"), { error: "err.badDate" })).toBe("date invalide");
  });
  it("interpolates variables", () => {
    expect(actionMessage(tr("en"), { error: "err.roleRequired", vars: { role: "devops" } })).toBe("devops role required");
  });
  it("translates a variable that is itself an error key", () => {
    expect(actionMessage(tr("en"), { error: "err.lotRow", vars: { n: 2, reason: "err.serviceNotFound" } }))
      .toBe("product 2: service not found");
  });
  it("passes a raw (non-key) message through", () => {
    expect(actionMessage(tr("en"), { error: "version is required" })).toBe("version is required");
  });
});

describe("rollbackText", () => {
  it("prefers the user's own comment", () => {
    expect(rollbackText(tr("en"), { comment: "bad release", previousVersion: "1.0.0" })).toBe("bad release");
  });
  it("composes a localized sentence from the target version", () => {
    expect(rollbackText(tr("en"), { comment: null, previousVersion: "1.0.0" })).toBe("Rollback to v1.0.0");
    expect(rollbackText(tr("fr"), { comment: null, previousVersion: "1.0.0" })).toBe("Rollback vers v1.0.0");
  });
  it("falls back when the previous version is unknown", () => {
    expect(rollbackText(tr("en"), { comment: null, previousVersion: null })).toBe("Rollback (previous version unknown)");
    expect(rollbackText(tr("fr"), { comment: "   ", previousVersion: null })).toBe("Rollback (version précédente inconnue)");
  });
});

describe("catalogs", () => {
  it("fr and en define exactly the same keys", () => {
    const fr = Object.keys(getMessages("fr")).sort();
    const en = Object.keys(getMessages("en")).sort();
    expect(en.filter((k) => !fr.includes(k))).toEqual([]);
    expect(fr.filter((k) => !en.includes(k))).toEqual([]);
  });
  it("has no untranslated (empty) value", () => {
    for (const loc of ["fr", "en"] as const) {
      for (const [k, v] of Object.entries(getMessages(loc))) {
        expect(v.trim(), `${loc}/${k}`).not.toBe("");
      }
    }
  });
});
