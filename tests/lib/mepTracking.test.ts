import { describe, it, expect } from "vitest";
import { mepFor, type Mep } from "../../prisma/seed/mep-tracking";

const mep = (over: Partial<Mep> = {}): Mep => ({
  date: "2026-08-27",
  environments: ["SECURE"],
  hotfix: false,
  rolledBack: false,
  startMinutes: null,
  endMinutes: null,
  ...over,
});

/** 2026-08-27, Paris is UTC+2 — 13:01 local is 11:01Z. */
const at = (hhmmZ: string) => new Date(`2026-08-27T${hhmmZ}:00Z`);

describe("mepFor", () => {
  it("matches a deployment to the MEP of its day and environment", () => {
    const complet = mep();

    expect(mepFor([complet], "SECURE", at("11:01"))).toBe(complet);
  });

  it("ignores a MEP of another environment", () => {
    expect(mepFor([mep()], "RUN", at("11:01"))).toBeNull();
  });

  it("ignores a MEP of another day", () => {
    expect(mepFor([mep({ date: "2026-08-26" })], "SECURE", at("11:01"))).toBeNull();
  });

  it("expands a Both row to the two production environments", () => {
    const both = mep({ environments: ["RUN", "SECURE"] });

    expect(mepFor([both], "RUN", at("11:01"))).toBe(both);
    expect(mepFor([both], "SECURE", at("11:01"))).toBe(both);
  });

  it("picks the nearest preceding MEP when a day carries several", () => {
    // 13:01 and 17:38 Paris = 11:01Z and 15:38Z.
    const complet = mep({ startMinutes: 13 * 60 + 1 });
    const hotfix = mep({ hotfix: true, startMinutes: 17 * 60 + 38 });

    expect(mepFor([complet, hotfix], "SECURE", at("11:30"))).toBe(complet);
    expect(mepFor([complet, hotfix], "SECURE", at("16:00"))).toBe(hotfix);
  });

  it("attributes a deployment made before the first window to that first MEP", () => {
    const complet = mep({ startMinutes: 13 * 60 + 1 });
    const hotfix = mep({ hotfix: true, startMinutes: 17 * 60 + 38 });

    // 10:00Z = 12:00 Paris, an hour before the complet window opened.
    expect(mepFor([complet, hotfix], "SECURE", at("10:00"))).toBe(complet);
  });

  it("refuses to guess when same-day MEPs disagree and carry no hour", () => {
    const complet = mep();
    const hotfix = mep({ hotfix: true });

    expect(mepFor([complet, hotfix], "SECURE", at("11:01"))).toBe("ambiguous");
  });

  it("does not call it ambiguous when the hourless MEPs agree", () => {
    const a = mep({ hotfix: true });
    const b = mep({ hotfix: true });

    expect(mepFor([a, b], "SECURE", at("11:01"))).toBe(a);
  });
});
