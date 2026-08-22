/**
 * The document must describe every route, or say why it doesn't.
 *
 * The spec had fallen to 20 of 57 routes with nothing to notice it, and the gaps
 * were not only missing paths: `/companies/{slug}` was documented with GET alone
 * while the route had grown a PUT and a DELETE. So this checks operations, not
 * just paths — a method added later to a path that is already covered is exactly
 * the shape the previous drift took.
 *
 * It reads the filesystem rather than a hand-kept list, so a new route file is
 * caught by existing having been added, not by anyone remembering to register it.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { openapiDocument } from "@/lib/openapi";
import { hierarchyPaths } from "@/lib/openapi/paths/hierarchy";
import { eventPaths } from "@/lib/openapi/paths/events";
import { hookPaths } from "@/lib/openapi/paths/hooks";
import { configPaths } from "@/lib/openapi/paths/config";
import { ingestPaths } from "@/lib/openapi/paths/ingest";
import { opsPaths } from "@/lib/openapi/paths/ops";

const API_ROOT = resolve(__dirname, "../../src/app/api");
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Routes the document deliberately leaves out, each with the reason. A stale
 * entry here fails the last test in this file, so the list cannot outlive the
 * routes it excuses.
 */
const EXCLUDED: Record<string, string> = {
  "/api/auth/login": "Establishes the session cookie; not part of the bearer/ingest contract this document describes.",
  "/api/auth/logout": "Clears the session cookie; see /api/auth/login.",
  "/api/auth/me": "Reads the current session; see /api/auth/login.",
  "/api/go/{token}": "One-click action link. Answers a browser with a redirect, not a JSON contract.",
  "/api/v1/calendar.ics": "Serves text/calendar for calendar clients, not JSON.",
  "/api/v1/calendars/{token}": "Tokenized ICS feed; same as /calendar.ics. Feeds are managed through /calendar-feeds, which is documented.",
  "/api/v1/openapi.json": "Serves this document.",
  "/api/v1/directory": "Browses the LDAP directory for the admin UI's user picker. Shape follows the UI, not a stable contract.",
  "/api/v1/directory/config": "Exposes the resolved LDAP config to the admin UI; see /directory.",
  "/api/v1/directory/sync": "Triggers an LDAP sync from the admin UI; see /directory.",
  "/api/v1/events/by-id/{id}/causal-candidates": "Autocomplete for the causal-link drawer. Shape follows that control.",
};

/** Every route.ts under src/app/api, as the OpenAPI path it serves. */
function routeFiles(dir = API_ROOT, prefix = "/api"): { path: string; file: string }[] {
  const out: { path: string; file: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // [slug] in the filesystem is {slug} in an OpenAPI path.
      const seg = entry.startsWith("[") && entry.endsWith("]") ? `{${entry.slice(1, -1)}}` : entry;
      out.push(...routeFiles(full, `${prefix}/${seg}`));
    } else if (entry === "route.ts") {
      out.push({ path: prefix, file: full });
    }
  }
  return out;
}

/** The HTTP methods a route file exports. */
function exportedMethods(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return METHODS.filter((m) => {
    const upper = m.toUpperCase();
    return new RegExp(`export\\s+(async\\s+)?function\\s+${upper}\\b`).test(src)
      || new RegExp(`export\\s+const\\s+${upper}\\b`).test(src);
  });
}

const routes = routeFiles();
const documented = openapiDocument.paths as unknown as Record<string, Record<string, unknown>>;

describe("route inventory", () => {
  it("finds the route files at all — a broken walk would make every other test vacuous", () => {
    expect(routes.length).toBeGreaterThan(40);
    expect(routes.map((r) => r.path)).toContain("/api/v1/companies/{slug}");
  });

  it("finds methods on a known route", () => {
    const companies = routes.find((r) => r.path === "/api/v1/companies/{slug}")!;
    expect(exportedMethods(companies.file)).toEqual(["get", "put", "delete"]);
  });
});

describe("every route is documented or excused", () => {
  it.each(routes.map((r) => [r.path, r.file] as const))("%s", (path, file) => {
    if (path in EXCLUDED) {
      expect(EXCLUDED[path].length, `${path} needs a real reason`).toBeGreaterThan(20);
      return;
    }
    const entry = documented[path];
    expect(entry, `${path} is neither documented nor listed in EXCLUDED`).toBeDefined();
    // Operations, not just the path: this is what the old drift slipped through.
    const missing = exportedMethods(file).filter((m) => !(m in entry));
    expect(missing, `${path} exports these without documenting them`).toEqual([]);
  });

  it("documents no operation the route does not export", () => {
    const byPath = new Map(routes.map((r) => [r.path, r.file]));
    const phantom: string[] = [];
    for (const [path, entry] of Object.entries(documented)) {
      const file = byPath.get(path);
      if (!file) continue; // covered by the next describe
      const real = exportedMethods(file);
      for (const m of METHODS) if (m in entry && !real.includes(m)) phantom.push(`${m.toUpperCase()} ${path}`);
    }
    expect(phantom).toEqual([]);
  });
});

describe("the document and the exclusion list do not outlive their routes", () => {
  const real = new Set(routes.map((r) => r.path));

  it("documents no path that has no route", () => {
    expect(Object.keys(documented).filter((p) => !real.has(p))).toEqual([]);
  });

  it("excuses no path that has no route", () => {
    expect(Object.keys(EXCLUDED).filter((p) => !real.has(p))).toEqual([]);
  });

  it("excuses nothing it also documents", () => {
    expect(Object.keys(EXCLUDED).filter((p) => p in documented)).toEqual([]);
  });
});

/**
 * The modules are merged with object spread, so two modules claiming the same
 * path would silently drop one of them. Counting keys catches that.
 */
describe("the path modules do not collide", () => {
  it("contributes as many paths as the modules declare between them", () => {
    const modules = [hierarchyPaths, eventPaths, hookPaths, configPaths, ingestPaths, opsPaths];
    const declared = modules.reduce((n, m) => n + Object.keys(m).length, 0);
    expect(Object.keys(documented)).toHaveLength(declared);
  });
});
