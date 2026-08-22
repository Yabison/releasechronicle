/** Companies, products, services, and the two service read endpoints. */
export const hierarchyPaths = {
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
} as const;
