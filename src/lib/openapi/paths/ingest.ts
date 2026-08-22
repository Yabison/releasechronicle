/**
 * CI ingest: the two endpoints a build pipeline calls, and the management of the
 * tokens they authenticate with.
 *
 * The two ingest endpoints do NOT share a credential, which is easy to get wrong:
 * /ingest/deployments takes a per-source token, /ingest/runtime takes the global
 * write token.
 *
 * Every ingest-source response contains the token in plaintext. That is why all
 * of these reads are admin-only, and why the audit trail records the label rather
 * than the token.
 */
const slug = { name: "slug", in: "path", required: true, schema: { type: "string" } } as const;
const id = { name: "id", in: "path", required: true, schema: { type: "string" } } as const;
const companyQ = { name: "company", in: "query", required: true, schema: { type: "string" } } as const;
const productQ = { name: "product", in: "query", required: true, schema: { type: "string" } } as const;
const err = { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } as const;
const unauthorized = { description: "No admin session", content: err } as const;
const notFound = { description: "Not found", content: err } as const;

const sourceBody = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["label"],
        properties: {
          label: { type: "string" },
          defaultEnvironment: {
            type: "string",
            description: "An active environment slug, or the literal \"ALL\" to store no default. Anything else is a 400; a non-string is treated as absent and therefore also refused.",
          },
        },
      },
    },
  },
} as const;
const created = {
  "201": {
    description: "Created, including the plaintext token — this is the only place it is shown in a create response",
    content: { "application/json": { schema: { $ref: "#/components/schemas/IngestSource" } } },
  },
  "400": { description: "Missing label or an unusable defaultEnvironment", content: err },
  "401": unauthorized,
} as const;
const listed = {
  "200": {
    description: "Sources, each carrying its plaintext token",
    content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/IngestSource" } } } },
  },
  "401": unauthorized,
} as const;

export const ingestPaths = {
  "/api/v1/ingest/deployments": {
    post: {
      summary: "Record a deployment from CI",
      description:
        "Authenticated by a per-source ingest token, which also decides how much of the body is needed: a SERVICE-scoped token resolves its own service, a COMPANY-scoped one needs product and service, a GLOBAL one needs company, product and service. A token whose service or company has been soft-deleted stops resolving; a GLOBAL token keeps working because its target is per-request. Auto-lot grouping and rollback detection run afterwards and never fail the call.",
      security: [{ sourceToken: [] }],
      parameters: [
        { name: "token", in: "query", required: false, schema: { type: "string" }, description: "Alternative to the Authorization header, for CI systems that cannot set one" },
      ],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CiDeploymentInput" } } } },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } } },
        "400": { description: "Invalid body, missing slugs for the token's scope, or an unknown environment", content: err },
        "401": { description: "Missing, unknown or disabled token", content: err },
        "404": { description: "The service the slugs point at does not exist", content: err },
      },
    },
  },
  "/api/v1/ingest/runtime": {
    post: {
      summary: "Report the build a service is actually running",
      description:
        "Feeds drift detection: the reported build is compared with the deployment the app believes is live. Takes the global write token, not an ingest-source token.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["company", "product", "service", "environment", "build"],
              properties: {
                company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
                environment: { type: "string" },
                build: { type: "string", description: "The version the running instance reports" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Recorded" },
        "400": { description: "Invalid body", content: err },
        "401": { description: "Missing or invalid write token", content: err },
        "404": { description: "Service not found", content: err },
      },
    },
  },
  "/api/v1/ingest-sources": {
    get: { summary: "List global ingest sources", security: [{ adminSession: [] }], responses: listed },
    post: { summary: "Create a global ingest source", security: [{ adminSession: [] }], requestBody: sourceBody, responses: created },
  },
  "/api/v1/ingest-sources/{id}": {
    delete: {
      summary: "Delete an ingest source",
      description: "Revokes the token immediately.",
      security: [{ adminSession: [] }],
      parameters: [id],
      responses: { "200": { description: "Deleted" }, "401": unauthorized, "404": notFound },
    },
  },
  "/api/v1/companies/{slug}/ingest-sources": {
    get: { summary: "List a company's ingest sources", security: [{ adminSession: [] }], parameters: [slug], responses: { ...listed, "404": notFound } },
    post: {
      summary: "Create a company-scoped ingest source",
      description: "Its token needs product and service in every ingest body.",
      security: [{ adminSession: [] }],
      parameters: [slug],
      requestBody: sourceBody,
      responses: { ...created, "404": notFound },
    },
  },
  "/api/v1/services/{slug}/ingest-sources": {
    get: { summary: "List a service's ingest sources", security: [{ adminSession: [] }], parameters: [slug, companyQ, productQ], responses: { ...listed, "404": notFound } },
    post: {
      summary: "Create a service-scoped ingest source",
      description: "Its token resolves the service on its own, so an ingest body needs no slugs.",
      security: [{ adminSession: [] }],
      parameters: [slug, companyQ, productQ],
      requestBody: sourceBody,
      responses: { ...created, "404": notFound },
    },
  },
  "/api/v1/services/{slug}/ingest-sources/{id}": {
    delete: {
      summary: "Delete a service-scoped ingest source",
      security: [{ adminSession: [] }],
      parameters: [slug, id, companyQ, productQ],
      responses: { "200": { description: "Deleted" }, "401": unauthorized, "404": notFound },
    },
  },
} as const;
