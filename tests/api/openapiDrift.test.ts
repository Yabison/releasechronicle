/**
 * Structural guards on the OpenAPI document.
 *
 * The spec had drifted badly enough to misinform a generated client: it declared
 * `environment` as a fixed enum long after environments became configurable rows,
 * and its ChangeType and DeployStatus enums were each two values behind Prisma.
 * Hardcoding the corrected lists here would rot the same way, so these tests
 * compare against the Prisma enums themselves — adding a value to the schema
 * without adding it to the document fails the build.
 */
import { describe, it, expect } from "vitest";
import { ChangeType, DeployStatus, IncidentStatus, EventType, ServiceType, EventSource } from "@prisma/client";
import { openapiDocument } from "@/lib/openapi";

const doc = openapiDocument as unknown as {
  components: { schemas: Record<string, Record<string, unknown>> };
  paths: Record<string, Record<string, unknown>>;
};
const schemas = doc.components.schemas;

/** Every `$ref` anywhere in the document, with the JSON path that reached it. */
function collectRefs(node: unknown, at = "$"): { at: string; ref: string }[] {
  if (Array.isArray(node)) return node.flatMap((v, i) => collectRefs(v, `${at}[${i}]`));
  if (!node || typeof node !== "object") return [];
  const out: { at: string; ref: string }[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "$ref" && typeof v === "string") out.push({ at, ref: v });
    else out.push(...collectRefs(v, `${at}.${k}`));
  }
  return out;
}

function prop(schema: string, name: string): Record<string, unknown> {
  const props = schemas[schema].properties as Record<string, Record<string, unknown>>;
  return props[name];
}

describe("enums stay in step with Prisma", () => {
  it.each([
    ["Event", "changeType"],
    ["DeploymentInput", "changeType"],
  ])("%s.%s lists every ChangeType", (schema, name) => {
    expect(prop(schema, name).enum).toEqual(Object.values(ChangeType));
  });

  it.each([
    ["Event", "deployStatus"],
    ["DeploymentInput", "deployStatus"],
  ])("%s.%s lists every DeployStatus", (schema, name) => {
    expect(prop(schema, name).enum).toEqual(Object.values(DeployStatus));
  });

  it.each([
    ["Event", "incidentStatus"],
    ["IncidentInput", "incidentStatus"],
  ])("%s.%s lists every IncidentStatus", (schema, name) => {
    expect(prop(schema, name).enum).toEqual(Object.values(IncidentStatus));
  });

  it("Event.type lists every EventType", () => {
    expect(prop("Event", "type").enum).toEqual(Object.values(EventType));
  });

  it("Event.source lists every EventSource", () => {
    expect(prop("Event", "source").enum).toEqual(Object.values(EventSource));
  });

  it("Service.type lists every ServiceType", () => {
    expect(prop("Service", "type").enum).toEqual(Object.values(ServiceType));
  });
});

/**
 * Environments stopped being an enum at the drop_environment_enum migration. A
 * generated client carrying the old four values rejects any environment an
 * operator has since configured, which is worse than no documentation at all.
 */
describe("environment is a free string, not an enum", () => {
  it.each(["Event", "DeploymentInput", "IncidentInput", "MaintenanceInput"])(
    "%s.environment declares no enum",
    (schema) => {
      const p = prop(schema, "environment");
      expect(p.type).toBe("string");
      expect(p.enum).toBeUndefined();
      expect(p.description).toMatch(/environments/i);
    },
  );
});

describe("every $ref resolves", () => {
  it("points only at schemas the document declares", () => {
    const refs = collectRefs(doc);
    expect(refs.length).toBeGreaterThan(0);
    const broken = refs
      .filter((r) => !r.ref.startsWith("#/components/schemas/") || !(r.ref.split("/").pop()! in schemas))
      .map((r) => `${r.at} -> ${r.ref}`);
    expect(broken).toEqual([]);
  });

  it("declares no schema nothing references", () => {
    const used = new Set(collectRefs(doc).map((r) => r.ref.split("/").pop()!));
    expect(Object.keys(schemas).filter((s) => !used.has(s))).toEqual([]);
  });
});
