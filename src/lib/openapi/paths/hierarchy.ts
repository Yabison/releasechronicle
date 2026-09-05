/**
 * Companies, products, services — and the two service read endpoints.
 *
 * Reads are public (public mode narrows what an anonymous caller sees); every
 * write is `adminSession`, never a write token. Each write endpoint calls
 * requireAdmin, which reads the session cookie and nothing else.
 */
const slug = { name: "slug", in: "path", required: true, schema: { type: "string" } } as const;
const companyQ = { name: "company", in: "query", required: true, schema: { type: "string" } } as const;
const productQ = { name: "product", in: "query", required: true, schema: { type: "string" } } as const;
const includeDeleted = {
  name: "includeDeleted", in: "query", required: false, schema: { type: "string", enum: ["1"] },
  description: "Admin sessions only: also return soft-deleted rows. Silently ignored for anyone else rather than refused.",
} as const;

const unauthorized = {
  description: "No admin session",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
} as const;
const notFound = {
  description: "Not found",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
} as const;
const badRequest = {
  description: "Missing query parameter, or a body with nothing to update",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
} as const;

export const hierarchyPaths = {
  "/api/v1/companies": {
    get: {
      summary: "List companies",
      parameters: [includeDeleted],
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
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
          },
        },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Company" } } } },
        "400": badRequest,
        "401": unauthorized,
        "409": { description: "A company with this slug already exists", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/companies/{slug}": {
    get: {
      summary: "Get a company by slug",
      parameters: [slug],
      responses: {
        "200": { description: "Company", content: { "application/json": { schema: { $ref: "#/components/schemas/Company" } } } },
        "404": notFound,
      },
    },
    put: {
      summary: "Update a company's auto-lot naming, sort order or public flag",
      security: [{ adminSession: [] }],
      parameters: [slug],
      requestBody: {
        required: true,
        description: "At least one field must be present, or the call is a 400.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                autoLotNaming: { type: "string", enum: ["master", "date"] },
                sortOrder: { type: "integer" },
                public: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Company" } } } },
        "400": badRequest,
        "401": unauthorized,
        "404": notFound,
      },
    },
    delete: {
      summary: "Soft-delete a company and everything under it",
      description: "Cascades to the company's products and services, stamping one shared batch id so POST /restore can put back exactly what this call removed.",
      security: [{ adminSession: [] }],
      parameters: [slug],
      responses: {
        "200": {
          description: "Deleted, with what the cascade reached",
          content: {
            "application/json": {
              schema: { type: "object", properties: { products: { type: "integer" }, services: { type: "integer" } } },
            },
          },
        },
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Already deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/companies/{slug}/restore": {
    post: {
      summary: "Restore a soft-deleted company and its batch",
      description: "Puts back exactly the rows the matching delete removed, by batch id. Refused when a live company already holds the slug.",
      security: [{ adminSession: [] }],
      parameters: [slug],
      responses: {
        "200": {
          description: "Restored, with what came back",
          content: {
            "application/json": {
              schema: { type: "object", properties: { products: { type: "integer" }, services: { type: "integer" } } },
            },
          },
        },
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Not deleted, or the slug is taken by a live company", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/products": {
    get: {
      summary: "List products for a company",
      parameters: [companyQ, includeDeleted],
      responses: {
        "200": { description: "Products", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Product" } } } } },
        "400": badRequest,
        "404": { description: "Company not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    post: {
      summary: "Create a product",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["companyId", "name"],
              properties: { companyId: { type: "string" }, name: { type: "string" } },
            },
          },
        },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Product" } } } },
        "400": badRequest,
        "401": unauthorized,
        "409": { description: "A product with this slug already exists in the company", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/products/{slug}": {
    get: {
      summary: "Get a product by slug within a company",
      parameters: [slug, companyQ],
      responses: {
        "200": { description: "Product", content: { "application/json": { schema: { $ref: "#/components/schemas/Product" } } } },
        "400": badRequest,
        "404": notFound,
      },
    },
    put: {
      summary: "Update a product's env workflow, sort order or public flag — or move it to another company",
      description: "Passing companyId moves the product and ignores the other fields.",
      security: [{ adminSession: [] }],
      parameters: [slug, companyQ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                companyId: { type: "string", description: "Move the product under this company" },
                envWorkflow: { type: "array", items: { type: "string" }, description: "Every entry must be an active environment slug" },
                sortOrder: { type: "integer" },
                public: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Product" } } } },
        "400": badRequest,
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Slug taken in the destination company, or the destination is not live", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    delete: {
      summary: "Soft-delete a product and its services",
      security: [{ adminSession: [] }],
      parameters: [slug, companyQ],
      responses: {
        "200": {
          description: "Deleted, with what the cascade reached",
          content: { "application/json": { schema: { type: "object", properties: { services: { type: "integer" } } } } },
        },
        "400": badRequest,
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Already deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/products/{slug}/restore": {
    post: {
      summary: "Restore a soft-deleted product and its batch",
      security: [{ adminSession: [] }],
      parameters: [slug, companyQ],
      responses: {
        "200": { description: "Restored", content: { "application/json": { schema: { type: "object", properties: { services: { type: "integer" } } } } } },
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Not deleted, the slug is taken, or an ancestor is still deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/services": {
    get: {
      summary: "List services for a product",
      parameters: [companyQ, productQ, includeDeleted],
      responses: {
        "200": { description: "Services", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Service" } } } } },
        "400": badRequest,
        "404": { description: "Product not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    post: {
      summary: "Create a service",
      security: [{ adminSession: [] }],
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
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Service" } } } },
        "400": badRequest,
        "401": unauthorized,
        "409": { description: "A service with this slug already exists in the product", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/services/{slug}": {
    get: {
      summary: "Get a service by slug within a company/product",
      parameters: [slug, companyQ, productQ],
      responses: {
        "200": { description: "Service", content: { "application/json": { schema: { $ref: "#/components/schemas/Service" } } } },
        "400": badRequest,
        "404": notFound,
      },
    },
    put: {
      summary: "Update a service's build-URL template, master flag or env workflow — or move it to another product",
      description: "Passing productId moves the service and ignores the other fields. An empty buildUrlTemplate clears it.",
      security: [{ adminSession: [] }],
      parameters: [slug, companyQ, productQ],
      requestBody: {
        required: true,
        description: "At least one field must be present, or the call is a 400.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                productId: { type: "string", description: "Move the service under this product" },
                buildUrlTemplate: { type: "string", description: "Empty or blank clears the template" },
                isMaster: { type: "boolean" },
                envWorkflow: { type: "array", items: { type: "string" }, description: "Every entry must be an active environment slug" },
                envWorkflowOverride: { type: "boolean" },
                sortOrder: { type: "integer" },
                public: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Service" } } } },
        "400": badRequest,
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Slug taken in the destination product, or the destination is not live", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    delete: {
      summary: "Soft-delete a service",
      security: [{ adminSession: [] }],
      parameters: [slug, companyQ, productQ],
      responses: {
        "200": { description: "Deleted", content: { "application/json": { schema: { type: "object" } } } },
        "400": badRequest,
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Already deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/services/{slug}/restore": {
    post: {
      summary: "Restore a soft-deleted service",
      security: [{ adminSession: [] }],
      parameters: [slug, companyQ, productQ],
      responses: {
        "200": { description: "Restored", content: { "application/json": { schema: { type: "object" } } } },
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Not deleted, the slug is taken, or an ancestor is still deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/services/{slug}/current": {
    get: {
      summary: "Current live event per environment for a service",
      parameters: [slug, companyQ, productQ],
      responses: {
        "200": {
          description: "One entry per environment that has a live event",
          content: { "application/json": { schema: { type: "object", additionalProperties: { $ref: "#/components/schemas/Event" } } } },
        },
        "400": badRequest,
        "404": { description: "Service not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/services/{slug}/changelog": {
    get: {
      summary: "Release notes for a service, newest release first",
      description:
        "One note per (service, version): an environment promotion redeploys the same release and finds the same note. Readable anonymously only when the whole company/product/service chain is public AND the changelog visibility setting is PUBLIC -- the setting can only take access away, never grant it. A caller who may not read them gets 404, like everything else private here.",
      parameters: [slug, companyQ, productQ],
      responses: {
        "200": {
          description: "The service's release notes",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["items"],
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["version", "body", "source", "updatedAt"],
                      properties: {
                        version: { type: "string" },
                        body: { type: "string", description: "Markdown source, as sent or typed" },
                        source: { type: "string", enum: ["CI", "UI"], description: "UI means edited by hand, which stops the CI overwriting it" },
                        authorName: { type: "string", nullable: true, description: "Set only for a hand-edited note" },
                        updatedAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": badRequest,
        "404": { description: "Service not found, or not readable by this caller", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },
  "/api/v1/services/{slug}/events": {
    get: {
      summary: "List events for a service (cursor-paginated, newest first)",
      parameters: [
        slug, companyQ, productQ,
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
} as const;
