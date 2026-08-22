import { describe, it, expect } from "vitest";
import { isSafeHomePath, isSafeHomeQuery, sanitize, homeTarget, EMPTY_PREFERENCES } from "@/lib/userPreferences";

describe("isSafeHomePath", () => {
  it("accepts a path on this site", () => {
    expect(isSafeHomePath("/")).toBe(true);
    expect(isSafeHomePath("/weda")).toBe(true);
    expect(isSafeHomePath("/weda/weda/weda")).toBe(true);
    expect(isSafeHomePath("/metrics")).toBe(true);
  });

  // The stored path ends up in a redirect, so anything that could leave the
  // site has to be refused. "//evil.com" is the one people forget: a browser
  // reads it as protocol-relative and goes to another host.
  it("refuses anything that leaves the site", () => {
    expect(isSafeHomePath("//evil.com")).toBe(false);
    expect(isSafeHomePath("https://evil.com")).toBe(false);
    expect(isSafeHomePath("http://evil.com")).toBe(false);
    expect(isSafeHomePath("javascript:alert(1)")).toBe(false);
    expect(isSafeHomePath("weda")).toBe(false);
    expect(isSafeHomePath("")).toBe(false);
  });

  it("refuses traversal", () => {
    expect(isSafeHomePath("/../etc/passwd")).toBe(false);
    expect(isSafeHomePath("/weda/../..")).toBe(false);
  });
});

describe("isSafeHomeQuery", () => {
  it("accepts a query string", () => {
    expect(isSafeHomeQuery("cat=INCIDENT")).toBe(true);
    expect(isSafeHomeQuery("cat=INCIDENT,HOTFIX&v=1.2")).toBe(true);
  });
  it("refuses a fragment, whitespace, or an overlong value", () => {
    expect(isSafeHomeQuery("cat=A#frag")).toBe(false);
    expect(isSafeHomeQuery("cat=A B")).toBe(false);
    expect(isSafeHomeQuery("x=" + "a".repeat(600))).toBe(false);
  });
});

describe("sanitize", () => {
  it("keeps valid values", () => {
    expect(sanitize({ locale: "en", theme: "dark", timeMode: "utc", homePath: "/weda", homeQuery: "cat=INCIDENT" })).toEqual({
      locale: "en", theme: "dark", timeMode: "utc", homePath: "/weda", homeQuery: "cat=INCIDENT",
    });
  });

  it("drops anything it does not recognise", () => {
    expect(sanitize({ locale: "klingon", theme: "solarized", homePath: "//evil.com", homeQuery: "a b" }))
      .toEqual(EMPTY_PREFERENCES);
  });

  it("tolerates a leading question mark on the query", () => {
    expect(sanitize({ homePath: "/weda", homeQuery: "?cat=A" }).homeQuery).toBe("cat=A");
  });

  // A pinned search with nowhere to be pinned is not a preference.
  it("drops a query with no path", () => {
    expect(sanitize({ homeQuery: "cat=A" }).homeQuery).toBeNull();
  });
});

describe("homeTarget", () => {
  it("is null until a path is chosen", () => {
    expect(homeTarget(EMPTY_PREFERENCES)).toBeNull();
    expect(homeTarget({ ...EMPTY_PREFERENCES, homeQuery: "cat=A" })).toBeNull();
  });
  it("joins the path and the pinned search", () => {
    expect(homeTarget({ ...EMPTY_PREFERENCES, homePath: "/weda" })).toBe("/weda");
    expect(homeTarget({ ...EMPTY_PREFERENCES, homePath: "/weda", homeQuery: "cat=A" })).toBe("/weda?cat=A");
  });
});

// "/" is what the app already does; keeping it as a target would make the home
// page redirect to itself.
describe("homeTarget — the self-redirect", () => {
  it("treats a root path as no preference", () => {
    expect(homeTarget({ ...EMPTY_PREFERENCES, homePath: "/" })).toBeNull();
    expect(homeTarget({ ...EMPTY_PREFERENCES, homePath: "/", homeQuery: "cat=A" })).toBeNull();
  });
});

describe("sanitize — time mode", () => {
  it("keeps the two modes and drops the rest", () => {
    expect(sanitize({ timeMode: "utc" }).timeMode).toBe("utc");
    expect(sanitize({ timeMode: "local" }).timeMode).toBe("local");
    expect(sanitize({ timeMode: "UTC" }).timeMode).toBeNull();
    expect(sanitize({ timeMode: "" }).timeMode).toBeNull();
  });
});
