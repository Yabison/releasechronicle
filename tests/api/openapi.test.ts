import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/v1/openapi.json/route";

describe("GET /api/v1/openapi.json", () => {
  it("serves a valid OpenAPI 3 document", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe("releasechronicle API");
  });

  it("documents the hierarchy endpoints", async () => {
    const res = await GET();
    const doc = await res.json();
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/companies",
        "/api/v1/companies/{slug}",
        "/api/v1/products",
        "/api/v1/products/{slug}",
        "/api/v1/services",
        "/api/v1/services/{slug}",
      ]),
    );
  });

  /**
   * Three credentials, because the app has three. Declaring only bearerAuth and
   * attaching it to the administration endpoints told callers to send a write
   * token where requireAdmin reads the session cookie and nothing else.
   */
  it("declares the write-token, admin-session and ingest-source schemes", async () => {
    const doc = await (await GET()).json();
    const s = doc.components.securitySchemes;
    expect(s.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(s.sourceToken).toMatchObject({ type: "http", scheme: "bearer" });
    expect(s.adminSession).toMatchObject({ type: "apiKey", in: "cookie", name: "rc_session" });
  });

  it("guards the hierarchy writes with the admin session, not a write token", async () => {
    const doc = await (await GET()).json();
    for (const [path, method] of [
      ["/api/v1/companies", "post"], ["/api/v1/companies/{slug}", "put"], ["/api/v1/companies/{slug}", "delete"],
      ["/api/v1/products", "post"], ["/api/v1/products/{slug}", "put"], ["/api/v1/products/{slug}", "delete"],
      ["/api/v1/services", "post"], ["/api/v1/services/{slug}", "put"], ["/api/v1/services/{slug}", "delete"],
    ] as const) {
      expect(doc.paths[path][method].security, `${method.toUpperCase()} ${path}`).toEqual([{ adminSession: [] }]);
    }
  });

  it("keeps the write token on the event writes", async () => {
    const doc = await (await GET()).json();
    expect(doc.paths["/api/v1/deployments"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths["/api/v1/hooks/deliveries/sweep"].post.security).toEqual([{ bearerAuth: [] }]);
  });
});

describe("OpenAPI schemas", () => {
  it("declares event, input, hook and error schemas", async () => {
    const doc = await (await GET()).json();
    const s = Object.keys(doc.components.schemas);
    expect(s).toEqual(expect.arrayContaining([
      "Event", "DeploymentInput", "IncidentInput", "MaintenanceInput",
      "RollbackInput", "QaInput", "ObservationInput", "HookInput", "Hook", "Error",
    ]));
  });
  it("adds buildUrlTemplate and isMaster to Service", async () => {
    const doc = await (await GET()).json();
    expect(doc.components.schemas.Service.properties.buildUrlTemplate).toBeDefined();
    expect(doc.components.schemas.Service.properties.isMaster).toBeDefined();
  });
});

describe("OpenAPI event paths", () => {
  it("documents create + upsert for each event type", async () => {
    const doc = await (await GET()).json();
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining([
      "/api/v1/deployments", "/api/v1/deployments/{externalId}",
      "/api/v1/incidents", "/api/v1/incidents/{externalId}",
      "/api/v1/maintenances", "/api/v1/maintenances/{externalId}",
    ]));
  });
  it("deployments POST requires a bearer token and a DeploymentInput body", async () => {
    const doc = await (await GET()).json();
    const post = doc.paths["/api/v1/deployments"].post;
    expect(post.security).toEqual([{ bearerAuth: [] }]);
    expect(post.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/DeploymentInput");
  });
});

describe("OpenAPI remaining paths", () => {
  it("documents annotations, hooks, product PUT and service reads", async () => {
    const doc = await (await GET()).json();
    const keys = Object.keys(doc.paths);
    expect(keys).toEqual(expect.arrayContaining([
      "/api/v1/deployments/by-id/{id}/rollback",
      "/api/v1/deployments/by-id/{id}/qa",
      "/api/v1/deployments/by-id/{id}/observation",
      "/api/v1/products/{slug}/hooks",
      "/api/v1/products/{slug}/hooks/{hookId}",
      "/api/v1/services/{slug}/current",
      "/api/v1/services/{slug}/events",
    ]));
    expect(doc.paths["/api/v1/products/{slug}"].put).toBeDefined();
    expect(doc.paths["/api/v1/products/{slug}/hooks"].post.requestBody.content["application/json"].schema.$ref)
      .toBe("#/components/schemas/HookInput");
  });
});
