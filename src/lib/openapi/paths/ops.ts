/**
 * Operations: the cron entry points, the DORA read, lot grouping, and the
 * delivery log.
 *
 * The two lot endpoints deliberately take different credentials — candidates
 * needs a caller who is merely signed in, auto-group is a cron entry point on
 * the write token.
 */
const err = { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } as const;

export const opsPaths = {
  "/api/v1/deployments/promote-scheduled": {
    post: {
      summary: "Promote scheduled deployments that are nearly due",
      description:
        "Cron entry point. Moves GO_CONFIRMED deployments whose scheduledAt falls inside the lead window to PENDING, then fires their hooks. `promoted` and `ids` count deployments that actually moved; `notifyFailed` is the subset that moved but whose hooks could not be enqueued, so nobody was told. A job that reads only the status code cannot tell those two outcomes apart.",
      security: [{ bearerAuth: [] }],
      responses: {
        "200": {
          description: "What moved, and what moved without notifying anyone",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["promoted", "ids", "notifyFailed"],
                properties: {
                  promoted: { type: "integer" },
                  ids: { type: "array", items: { type: "string" } },
                  notifyFailed: { type: "array", items: { type: "string" }, description: "Promoted, but the hook enqueue failed" },
                },
              },
            },
          },
        },
        "401": { description: "Missing or invalid write token", content: err },
      },
    },
  },
  "/api/v1/metrics/dora": {
    get: {
      summary: "DORA metrics over a rolling window",
      description: "Public. An anonymous caller is restricted to the environments public mode exposes, so the same query can legitimately return different numbers with and without a session.",
      parameters: [
        { name: "company", in: "query", required: false, schema: { type: "string" } },
        { name: "product", in: "query", required: false, schema: { type: "string" } },
        { name: "service", in: "query", required: false, schema: { type: "string" } },
        { name: "environment", in: "query", required: false, schema: { type: "string" } },
        {
          name: "days", in: "query", required: false,
          schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
          description: "Clamped to 365; a non-integer or non-positive value falls back to 30 rather than being refused",
        },
      ],
      responses: {
        "200": { description: "The four metrics and their bands", content: { "application/json": { schema: { $ref: "#/components/schemas/DoraMetrics" } } } },
      },
    },
  },
  "/api/v1/lots/candidates": {
    get: {
      summary: "Deployments eligible to be grouped into a lot",
      description:
        "Feeds the lot-creation form, so it needs a signed-in caller of any role rather than an admin. It lists a whole company's deployments for one environment regardless of public flags, which is why it refuses anonymous callers outright.",
      security: [{ session: [] }],
      parameters: [
        { name: "company", in: "query", required: true, schema: { type: "string" } },
        { name: "environment", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Candidate deployments", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Event" } } } } },
        "400": { description: "Missing company or environment", content: err },
        "401": { description: "Anonymous caller", content: err },
      },
    },
  },
  "/api/v1/lots/auto-group": {
    post: {
      summary: "Group ungrouped deployments into automatic lots",
      description: "Cron entry point. Sweeps deployments that fall inside a grouping window and attaches them to an auto-lot, leaving manual lots alone.",
      security: [{ bearerAuth: [] }],
      responses: {
        "200": {
          description: "How much grouping happened",
          content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
        },
        "401": { description: "Missing or invalid write token", content: err },
      },
    },
  },
  "/api/v1/products/{slug}/hooks/deliveries": {
    get: {
      summary: "Read a product's hook-delivery log",
      description: "Admin only: a delivery row stores the full outbound payload, which can carry anything the connector was told.",
      security: [{ adminSession: [] }],
      parameters: [
        { name: "slug", in: "path", required: true, schema: { type: "string" } },
        { name: "company", in: "query", required: true, schema: { type: "string" } },
        { name: "kind", in: "query", required: false, schema: { type: "string" }, description: "Event kind, e.g. deploy.status_changed" },
        { name: "type", in: "query", required: false, schema: { type: "string" }, description: "Connector type" },
        { name: "status", in: "query", required: false, schema: { type: "string", enum: ["PENDING", "OK", "FAILED", "DEAD"] }, description: "An unknown value is a 400, unlike the other filters" },
        { name: "statusCode", in: "query", required: false, schema: { type: "integer" } },
        { name: "error", in: "query", required: false, schema: { type: "string" } },
        { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }, description: "Clamped into range rather than refused" },
        { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } },
      ],
      responses: {
        "200": {
          description: "One page of deliveries",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  rows: { type: "array", items: { $ref: "#/components/schemas/HookDelivery" } },
                  total: { type: "integer" },
                },
              },
            },
          },
        },
        "400": { description: "Missing company, or an invalid status filter", content: err },
        "401": { description: "No admin session", content: err },
        "404": { description: "Product not found", content: err },
      },
    },
  },
} as const;
