/** Product hooks and the delivery-queue sweep. */
export const hookPaths = {
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
} as const;
