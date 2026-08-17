export const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "releasechronicle API",
    version: "1.0.0",
    description:
      "API for releasechronicle: hierarchy, events (deployments/incidents/maintenances) with annotations, product build-URL templates, and status-change hooks. Reads are public; writes require a bearer token.",
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      Company: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          slug: { type: "string" },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          slug: { type: "string" },
          companyId: { type: "string" },
        },
      },
      Service: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          slug: { type: "string" },
          type: { type: "string", enum: ["APP", "COMPONENT", "API"] },
          productId: { type: "string" },
          buildUrlTemplate: { type: "string", nullable: true },
          isMaster: { type: "boolean" },
        },
      },
      Error: { type: "object", properties: { error: { type: "string" } } },
      Event: {
        type: "object",
        properties: {
          id: { type: "string" },
          serviceId: { type: "string" },
          type: { type: "string", enum: ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"] },
          environment: { type: "string", enum: ["PROD", "PREPROD", "QA", "DEV"] },
          occurredAt: { type: "string", format: "date-time" },
          externalId: { type: "string", nullable: true },
          version: { type: "string", nullable: true },
          requester: { type: "string", nullable: true },
          changeType: { type: "string", enum: ["POSTMEP_SQL", "HOTFIX", "NORMAL"], nullable: true },
          deployStatus: { type: "string", enum: ["PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE"], nullable: true },
          incidentType: { type: "string", nullable: true },
          incidentStatus: { type: "string", enum: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"], nullable: true },
          startedAt: { type: "string", format: "date-time", nullable: true },
          resolvedAt: { type: "string", format: "date-time", nullable: true },
          comment: { type: "string", nullable: true },
          windowStart: { type: "string", format: "date-time", nullable: true },
          windowEnd: { type: "string", format: "date-time", nullable: true },
          lot: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      DeploymentInput: {
        type: "object",
        required: ["company", "product", "service", "environment", "version", "requester", "changeType"],
        properties: {
          company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
          environment: { type: "string", enum: ["PROD", "PREPROD", "QA", "DEV"] },
          version: { type: "string" }, requester: { type: "string" },
          changeType: { type: "string", enum: ["POSTMEP_SQL", "HOTFIX", "NORMAL"] },
          deployStatus: { type: "string", enum: ["PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE"] },
          occurredAt: { type: "string", format: "date-time" },
          externalLink: { type: "string" }, lot: { type: "string" }, externalId: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      IncidentInput: {
        type: "object",
        required: ["company", "product", "service", "environment", "incidentType", "startedAt"],
        properties: {
          company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
          environment: { type: "string", enum: ["PROD", "PREPROD", "QA", "DEV"] },
          incidentType: { type: "string" },
          startedAt: { type: "string", format: "date-time" },
          resolvedAt: { type: "string", format: "date-time" },
          incidentStatus: { type: "string", enum: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] },
          comment: { type: "string" }, externalId: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      MaintenanceInput: {
        type: "object",
        required: ["company", "product", "service", "environment", "windowStart", "windowEnd"],
        properties: {
          company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
          environment: { type: "string", enum: ["PROD", "PREPROD", "QA", "DEV"] },
          windowStart: { type: "string", format: "date-time" },
          windowEnd: { type: "string", format: "date-time" },
          version: { type: "string" }, externalId: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      RollbackInput: { type: "object", required: ["comment"], properties: { comment: { type: "string" }, link: { type: "string" } } },
      QaInput: { type: "object", required: ["validatedBy"], properties: { validatedBy: { type: "string" }, comment: { type: "string" } } },
      ObservationInput: { type: "object", required: ["who", "durationMinutes"], properties: { who: { type: "string" }, durationMinutes: { type: "integer" }, comment: { type: "string" } } },
      HookInput: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string" }, url: { type: "string" },
          config: { type: "object", additionalProperties: true },
          events: { type: "array", items: { type: "string" } },
          enabled: { type: "boolean" },
        },
      },
      Hook: {
        type: "object",
        properties: {
          id: { type: "string" }, productId: { type: "string" }, type: { type: "string" },
          events: { type: "array", items: { type: "string" } },
          config: { type: "object", additionalProperties: true },
          enabled: { type: "boolean" }, createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/api/v1/companies": {
      get: {
        summary: "List companies",
        responses: {
          "200": {
            description: "Companies",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Company" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a company",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Validation error" },
          "401": { description: "Missing or invalid token" },
        },
      },
    },
    "/api/v1/companies/{slug}": {
      get: {
        summary: "Get a company by slug",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Company" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/products": {
      get: {
        summary: "List products for a company",
        parameters: [
          { name: "company", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Products" }, "404": { description: "Company not found" } },
      },
      post: {
        summary: "Create a product",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["companyId", "name"],
                properties: {
                  companyId: { type: "string" },
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Validation error" },
          "401": { description: "Missing or invalid token" },
        },
      },
    },
    "/api/v1/products/{slug}": {
      get: {
        summary: "Get a product by slug within a company",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Product" }, "404": { description: "Not found" } },
      },
      put: {
        summary: "Update a product's env workflow (or move it to another company)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: true, schema: { type: "string" } },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { envWorkflow: { type: "array", items: { type: "string" } }, companyId: { type: "string" } } } } } },
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Product" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/services": {
      get: {
        summary: "List services for a product",
        parameters: [
          { name: "company", in: "query", required: true, schema: { type: "string" } },
          { name: "product", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Services" }, "404": { description: "Product not found" } },
      },
      post: {
        summary: "Create a service",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId", "name", "type"],
                properties: {
                  productId: { type: "string" },
                  name: { type: "string" },
                  type: { type: "string", enum: ["APP", "COMPONENT", "API"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Validation error" },
          "401": { description: "Missing or invalid token" },
        },
      },
    },
    "/api/v1/services/{slug}": {
      get: {
        summary: "Get a service by slug within a company/product",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: true, schema: { type: "string" } },
          { name: "product", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Service" }, "404": { description: "Not found" } },
      },
    },
    "/api/v1/deployments": {
      post: {
        summary: "Create a deployment",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DeploymentInput" } } } },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
          "400": { description: "Invalid body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "Service not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/deployments/{externalId}": {
      put: {
        summary: "Create or update a deployment by externalId",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "externalId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DeploymentInput" } } } },
        responses: {
          "200": { description: "Upserted", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
          "400": { description: "Invalid body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/incidents": {
      post: {
        summary: "Create an incident",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/IncidentInput" } } } },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
          "400": { description: "Invalid body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/incidents/{externalId}": {
      put: {
        summary: "Create or update an incident by externalId",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "externalId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/IncidentInput" } } } },
        responses: {
          "200": { description: "Upserted", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/maintenances": {
      post: {
        summary: "Create a maintenance",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MaintenanceInput" } } } },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
          "400": { description: "Invalid body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/maintenances/{externalId}": {
      put: {
        summary: "Create or update a maintenance by externalId",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "externalId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MaintenanceInput" } } } },
        responses: {
          "200": { description: "Upserted", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/deployments/by-id/{id}/rollback": {
      post: {
        summary: "Add a rollback annotation to a deployment",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RollbackInput" } } } },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Invalid body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/deployments/by-id/{id}/qa": {
      post: {
        summary: "Add a QA validation to a deployment",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/QaInput" } } } },
        responses: { "201": { description: "Created" }, "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
      },
    },
    "/api/v1/deployments/by-id/{id}/observation": {
      post: {
        summary: "Add an observation to a deployment",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ObservationInput" } } } },
        responses: { "201": { description: "Created" }, "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
      },
    },
    "/api/v1/products/{slug}/hooks": {
      get: {
        summary: "List a product's hooks",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Hooks", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Hook" } } } } } },
      },
      post: {
        summary: "Create a hook on a product",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: true, schema: { type: "string" } },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/HookInput" } } } },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Hook" } } } },
          "400": { description: "Invalid type or config", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/products/{slug}/hooks/{hookId}": {
      delete: {
        summary: "Delete a hook",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "hookId", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Deleted" }, "401": { description: "Missing/invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
      },
    },
    "/api/v1/services/{slug}/current": {
      get: {
        summary: "Current live event per environment for a service",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: true, schema: { type: "string" } },
          { name: "product", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Current events" }, "404": { description: "Service not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
      },
    },
    "/api/v1/services/{slug}/events": {
      get: {
        summary: "List events for a service (cursor-paginated, newest first)",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "company", in: "query", required: true, schema: { type: "string" } },
          { name: "product", in: "query", required: true, schema: { type: "string" } },
          { name: "environment", in: "query", required: false, schema: { type: "string" } },
          { name: "type", in: "query", required: false, schema: { type: "string", enum: ["DEPLOYMENT", "INCIDENT", "MAINTENANCE"] } },
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "Only events at or after this instant" },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "Only events at or before this instant" },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" }, description: "Opaque cursor from the previous page's nextCursor" },
        ],
        responses: {
          "200": {
            description: "One page of events",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items", "nextCursor"],
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Event" } },
                    nextCursor: { type: "string", nullable: true, description: "Pass as ?cursor= to fetch the next page; null on the last page" },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid filter, limit or cursor", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/hooks/deliveries/sweep": {
      post: {
        summary: "Retry due hook deliveries and purge old ones",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Sweep counters",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { retried: { type: "integer" }, purged: { type: "integer" } },
                },
              },
            },
          },
          "401": { description: "Missing or invalid token" },
        },
      },
    },
  },
} as const;
