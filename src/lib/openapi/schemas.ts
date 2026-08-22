/**
 * `components` for the OpenAPI document: the bearer scheme and every schema the
 * paths reference. Kept apart from the paths so neither file has to be read in
 * full to change the other.
 */
export const components = {
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
} as const;
