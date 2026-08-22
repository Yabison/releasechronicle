/**
 * Instance configuration: environments and their groups, tags, public mode,
 * notification targets, calendar feeds, and the audit trail.
 *
 * Every write here is an admin session. Several of these bodies silently drop a
 * field of the wrong type instead of refusing it — that behaviour is called out
 * per field, because a client cannot otherwise tell an ignored update from an
 * applied one.
 */
const id = { name: "id", in: "path", required: true, schema: { type: "string" } } as const;
const err = { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } as const;
const unauthorized = { description: "No admin session", content: err } as const;
const notFound = { description: "Not found", content: err } as const;
const invalid = { description: "Invalid body", content: err } as const;
const ignoredIfWrongType = "A value of the wrong type is ignored rather than refused.";

export const configPaths = {
  "/api/v1/environments": {
    get: {
      summary: "List active environments",
      responses: {
        "200": { description: "Environments", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Environment" } } } } },
      },
    },
    post: {
      summary: "Create an environment",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "color"],
              properties: { name: { type: "string" }, color: { type: "string", description: "#rrggbb" } },
            },
          },
        },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Environment" } } } },
        "400": invalid,
        "401": unauthorized,
        "409": { description: "Slug already taken", content: err },
      },
    },
  },
  "/api/v1/environments/{id}": {
    put: {
      summary: "Update an environment",
      security: [{ adminSession: [] }],
      parameters: [id],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", description: `Blank or absent leaves it alone. ${ignoredIfWrongType}` },
                color: { type: "string", description: `#rrggbb. A non-string is ignored, but a string that is not a valid colour is a 400.` },
                sortOrder: { type: "integer", description: ignoredIfWrongType },
                public: { type: "boolean", description: ignoredIfWrongType },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Environment" } } } },
        "400": invalid,
        "401": unauthorized,
        "404": notFound,
      },
    },
    delete: {
      summary: "Soft-delete an environment",
      security: [{ adminSession: [] }],
      parameters: [id],
      responses: { "200": { description: "Deleted" }, "401": unauthorized, "404": notFound },
    },
  },
  "/api/v1/environment-groups": {
    get: {
      summary: "List environment groups",
      responses: {
        "200": { description: "Groups", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/EnvironmentGroup" } } } } },
      },
    },
    post: {
      summary: "Create an environment group",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string" },
                members: { type: "array", items: { type: "string" }, description: "Environment slugs. Non-string entries are dropped; a non-array becomes an empty list." },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvironmentGroup" } } } },
        "400": invalid,
        "401": unauthorized,
        "409": { description: "Slug already taken", content: err },
      },
    },
  },
  "/api/v1/environment-groups/{id}": {
    put: {
      summary: "Update an environment group",
      security: [{ adminSession: [] }],
      parameters: [id],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", description: ignoredIfWrongType },
                members: { type: "array", items: { type: "string" }, description: "Non-string entries are dropped; a non-array leaves the members alone." },
                sortOrder: { type: "integer", description: ignoredIfWrongType },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvironmentGroup" } } } },
        "400": invalid,
        "401": unauthorized,
        "404": notFound,
      },
    },
    delete: {
      summary: "Soft-delete an environment group",
      security: [{ adminSession: [] }],
      parameters: [id],
      responses: { "200": { description: "Deleted" }, "401": unauthorized, "404": notFound },
    },
  },
  "/api/v1/tags": {
    get: {
      summary: "List known tags and their colours",
      responses: {
        "200": { description: "Tags", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Tag" } } } } },
      },
    },
    post: {
      summary: "Create a tag",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "color"],
              properties: { name: { type: "string" }, color: { type: "string", description: "#rrggbb" } },
            },
          },
        },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Tag" } } } },
        "400": invalid,
        "401": unauthorized,
      },
    },
    put: {
      summary: "Rename a tag or change its colour",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string", description: "The tag to change" },
                newName: { type: "string", description: `Rename to this. ${ignoredIfWrongType}` },
                color: { type: "string", description: "A non-string is ignored, but a string that is not a valid colour is a 400." },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Tag" } } } },
        "400": invalid,
        "401": unauthorized,
        "404": notFound,
      },
    },
    delete: {
      summary: "Delete a tag",
      security: [{ adminSession: [] }],
      requestBody: {
        required: false,
        description: "An unparseable body is treated as an absent name rather than a 400.",
        content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } },
      },
      responses: { "200": { description: "Deleted" }, "400": invalid, "401": unauthorized, "404": notFound },
    },
  },
  "/api/v1/public-settings": {
    get: {
      summary: "Event types anonymous callers may see in public mode",
      responses: {
        "200": {
          description: "Public settings",
          content: { "application/json": { schema: { type: "object", properties: { eventTypes: { type: "array", items: { type: "string" } } } } } },
        },
      },
    },
    put: {
      summary: "Replace the publicly visible event types",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["eventTypes"],
              properties: { eventTypes: { type: "array", items: { type: "string" } } },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated, echoing the stored list", content: { "application/json": { schema: { type: "object", properties: { eventTypes: { type: "array", items: { type: "string" } } } } } } },
        "400": invalid,
        "401": unauthorized,
      },
    },
  },
  "/api/v1/notification-targets": {
    get: {
      summary: "List notification targets",
      security: [{ adminSession: [] }],
      responses: {
        "200": { description: "Targets", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/NotificationTarget" } } } } },
        "401": unauthorized,
      },
    },
    post: {
      summary: "Create a notification target",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["label"],
              properties: {
                type: { type: "string", description: "Connector name; an absent value becomes the empty string, which is then refused" },
                label: { type: "string" },
                config: { type: "object", additionalProperties: true, description: "A non-object becomes {}. A config carrying a url is checked against the outbound-URL policy." },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationTarget" } } } },
        "400": invalid,
        "401": unauthorized,
      },
    },
  },
  "/api/v1/notification-targets/{id}": {
    put: {
      summary: "Update a notification target's label or config",
      security: [{ adminSession: [] }],
      parameters: [id],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                label: { type: "string", description: `Blank or absent leaves it alone. ${ignoredIfWrongType}` },
                config: { type: "object", additionalProperties: true, description: "A non-object is ignored rather than refused." },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationTarget" } } } },
        "400": invalid,
        "401": unauthorized,
        "404": notFound,
      },
    },
    delete: {
      summary: "Delete a notification target",
      security: [{ adminSession: [] }],
      parameters: [id],
      responses: {
        "200": { description: "Deleted" },
        "401": unauthorized,
        "404": notFound,
        "409": { description: "Still attached to at least one hook", content: err },
      },
    },
  },
  "/api/v1/calendar-feeds": {
    get: {
      summary: "List calendar feeds",
      security: [{ adminSession: [] }],
      responses: {
        "200": { description: "Feeds", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/CalendarFeed" } } } } },
        "401": unauthorized,
      },
    },
    post: {
      summary: "Create a tokenized calendar feed",
      security: [{ adminSession: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string" },
                types: { type: "array", items: { type: "string" }, description: "Event types to include. Unknown or non-string entries are dropped rather than refused; an empty result means every type." },
                company: { type: "string", nullable: true },
                product: { type: "string", nullable: true },
                service: { type: "string", nullable: true },
                environment: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Created, including the feed token", content: { "application/json": { schema: { $ref: "#/components/schemas/CalendarFeed" } } } },
        "400": invalid,
        "401": unauthorized,
      },
    },
  },
  "/api/v1/calendar-feeds/{id}": {
    delete: {
      summary: "Delete a calendar feed",
      description: "Revokes the token: the ICS URL stops resolving immediately.",
      security: [{ adminSession: [] }],
      parameters: [id],
      responses: { "200": { description: "Deleted" }, "401": unauthorized, "404": notFound },
    },
  },
  "/api/v1/audit": {
    get: {
      summary: "Read the audit trail",
      description: "Admin only: the trail names who did what, and from which address. Newest first, with the row id as tiebreaker so paging cannot lose or repeat a row written in the same millisecond.",
      security: [{ adminSession: [] }],
      parameters: [
        { name: "action", in: "query", required: false, schema: { type: "string" } },
        { name: "actor", in: "query", required: false, schema: { type: "string" }, description: "Case-insensitive substring match" },
        { name: "ok", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] }, description: "Anything else is treated as no filter" },
        { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }, description: "Clamped into range rather than refused" },
        { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } },
      ],
      responses: {
        "200": {
          description: "One page of the trail, plus the unpaged total",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["rows", "total"],
                properties: {
                  rows: { type: "array", items: { $ref: "#/components/schemas/AuditRow" } },
                  total: { type: "integer" },
                },
              },
            },
          },
        },
        "401": unauthorized,
      },
    },
  },
} as const;
