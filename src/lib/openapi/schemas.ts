/**
 * `components` for the OpenAPI document: the bearer scheme and every schema the
 * paths reference. Kept apart from the paths so neither file has to be read in
 * full to change the other.
 */
export const components = {
  /**
   * Three credentials, not one. The document used to declare only `bearerAuth`
   * and attach it to the administration endpoints too, which is unusable advice:
   * requireAdmin reads the session cookie and nothing else, so a caller following
   * the old document sent a write token and got 401 for as long as it kept trying.
   */
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      description: "The RC_WRITE_TOKEN. Accepted by the event-writing endpoints and the cron entry points only.",
    },
    adminSession: {
      type: "apiKey",
      in: "cookie",
      name: "rc_session",
      description: "HttpOnly session cookie from POST /api/auth/login, carrying the admin role. The administration endpoints accept this and nothing else — a write token is refused with 401.",
    },
    session: {
      type: "apiKey",
      in: "cookie",
      name: "rc_session",
      description: "The same cookie as adminSession, but any signed-in role will do. Only GET /lots/candidates uses it: it needs a caller who is not anonymous, not a caller who is an admin.",
    },
    sourceToken: {
      type: "http",
      scheme: "bearer",
      description: "A per-source ingest token created through the ingest-sources endpoints. Also accepted as ?token= for CI systems that cannot set a header.",
    },
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
        environment: { type: "string", description: "Slug of a configured environment — see GET /api/v1/environments. Deliberately not an enum: environments became configurable rows, so a generated client must not reject one this document has never heard of." },
        occurredAt: { type: "string", format: "date-time" },
        externalId: { type: "string", nullable: true },
        version: { type: "string", nullable: true },
        requester: { type: "string", nullable: true },
        changeType: { type: "string", enum: ["POSTMEP_SQL", "HOTFIX", "NORMAL", "PRE_MEP", "POST_MEP"], nullable: true },
        deployStatus: { type: "string", enum: ["SCHEDULED", "PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE", "GO_CONFIRMED"], nullable: true },
        incidentType: { type: "string", nullable: true },
        incidentStatus: { type: "string", enum: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"], nullable: true },
        startedAt: { type: "string", format: "date-time", nullable: true },
        resolvedAt: { type: "string", format: "date-time", nullable: true },
        comment: { type: "string", nullable: true },
        windowStart: { type: "string", format: "date-time", nullable: true },
        windowEnd: { type: "string", format: "date-time", nullable: true },
        scheduledAt: { type: "string", format: "date-time", nullable: true, description: "Planned date of a SCHEDULED/GO_CONFIRMED deployment" },
        lot: { type: "string", nullable: true },
        autoLot: { type: "boolean", description: "True when the lot was assigned by automatic grouping rather than by hand" },
        hourType: { type: "string", nullable: true, description: "Working hours (HO) or outside them (HNO)" },
        externalLink: { type: "string", nullable: true },
        causedById: { type: "string", nullable: true, description: "Event this one was caused by; the cause may live in another service" },
        parentId: { type: "string", nullable: true, description: "Parent MEP/HOTFIX deployment of a PRE_MEP or POST_MEP phase" },
        source: { type: "string", enum: ["UI", "API"], description: "Whether the event was created through the UI or the API — externalId is unique per source" },
        metadata: { type: "object", additionalProperties: true, nullable: true },
        tags: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        deletedAt: { type: "string", format: "date-time", nullable: true, description: "Always null in practice: nothing soft-deletes an individual event, and the hierarchy cascade stamps companies, products and services only. Present because the column is, and every read filters on it." },
      },
    },
    DeploymentInput: {
      type: "object",
      // `version` is not in `required`: the schema in src/lib/schemas/event.ts makes
      // it conditional, and listing it unconditionally would make a generated
      // client reject a valid PRE_MEP body. OpenAPI 3.0 cannot express the three
      // conditions without an unreadable oneOf, so they are stated here instead.
      required: ["company", "product", "service", "environment", "requester", "changeType"],
      description:
        "Three conditional rules the property list cannot express: `version` is required unless `changeType` is PRE_MEP or POST_MEP; those two phases require `parentId` and `comment` instead; `scheduledAt` is required when `deployStatus` is SCHEDULED.",
      properties: {
        company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
        environment: { type: "string", description: "Slug of a configured environment — see GET /api/v1/environments. Deliberately not an enum: environments became configurable rows, so a generated client must not reject one this document has never heard of." },
        version: { type: "string", description: "Required unless changeType is PRE_MEP or POST_MEP" },
        requester: { type: "string" },
        changeType: { type: "string", enum: ["POSTMEP_SQL", "HOTFIX", "NORMAL", "PRE_MEP", "POST_MEP"] },
        deployStatus: { type: "string", enum: ["SCHEDULED", "PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE", "GO_CONFIRMED"], default: "PENDING" },
        occurredAt: { type: "string", format: "date-time", description: "Defaults to now" },
        scheduledAt: { type: "string", format: "date-time", nullable: true, description: "Planned date; required when deployStatus is SCHEDULED" },
        parentId: { type: "string", description: "Parent MEP/HOTFIX deployment; required for PRE_MEP and POST_MEP" },
        comment: { type: "string", description: "Required for PRE_MEP and POST_MEP" },
        hourType: { description: "HO (working hours) or HNO. Any other value is stored as null rather than rejected." },
        externalLink: { type: "string", nullable: true },
        lot: { type: "string", description: "Defaults to `version` when omitted" },
        externalId: { type: "string", description: "Unique per source; the API and the UI have separate namespaces" },
        metadata: { description: "Arbitrary JSON kept with the event; any type is accepted" },
        tags: { type: "array", items: { type: "string" }, description: "A value that is not an array of strings is dropped rather than rejected" },
      },
    },
    IncidentInput: {
      type: "object",
      required: ["company", "product", "service", "environment", "incidentType", "startedAt"],
      properties: {
        company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
        environment: { type: "string", description: "Slug of a configured environment — see GET /api/v1/environments. Deliberately not an enum: environments became configurable rows, so a generated client must not reject one this document has never heard of." },
        incidentType: { type: "string" },
        startedAt: { type: "string", format: "date-time", description: "Also becomes the event's occurredAt" },
        resolvedAt: { type: "string", format: "date-time", nullable: true },
        incidentStatus: { type: "string", enum: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"], description: "Defaults to RESOLVED when resolvedAt is given, INVESTIGATING otherwise" },
        comment: { type: "string" }, externalId: { type: "string" },
        metadata: { description: "Arbitrary JSON kept with the event; any type is accepted" },
        tags: { type: "array", items: { type: "string" }, description: "A value that is not an array of strings is dropped rather than rejected" },
      },
    },
    MaintenanceInput: {
      type: "object",
      required: ["company", "product", "service", "environment", "windowStart", "windowEnd"],
      properties: {
        company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
        environment: { type: "string", description: "Slug of a configured environment — see GET /api/v1/environments. Deliberately not an enum: environments became configurable rows, so a generated client must not reject one this document has never heard of." },
        windowStart: { type: "string", format: "date-time", description: "Also becomes the event's occurredAt" },
        windowEnd: { type: "string", format: "date-time", description: "Must not be earlier than windowStart" },
        version: { type: "string", nullable: true }, externalId: { type: "string" },
        metadata: { description: "Arbitrary JSON kept with the event; any type is accepted" },
        tags: { type: "array", items: { type: "string" }, description: "A value that is not an array of strings is dropped rather than rejected" },
      },
    },
    RollbackInput: { type: "object", required: ["comment"], properties: { comment: { type: "string" }, link: { type: "string" } } },
    QaInput: { type: "object", required: ["validatedBy"], properties: { validatedBy: { type: "string" }, comment: { type: "string" } } },
    ObservationInput: { type: "object", required: ["who", "durationMinutes"], properties: { who: { type: "string" }, durationMinutes: { type: "integer" }, comment: { type: "string" } } },
    HookInput: {
      type: "object",
      required: ["type"],
      description:
        "A hook delivers either through its own `config` or through an attached notification target — never both. Sending a config while a target is attached is refused rather than silently dropped, because a stored-but-unused config would come back into force, unvalidated, on a later detach.",
      properties: {
        type: { type: "string", description: "Connector name; must match the target's type when targetId is given" },
        url: { type: "string", description: "Convenience for config.url. Checked against the outbound-URL policy: http(s) only, link-local addresses always refused, and private addresses too when RC_WEBHOOK_BLOCK_PRIVATE is set." },
        config: { type: "object", additionalProperties: true, nullable: true, description: "Connector configuration. Refused when targetId is set." },
        targetId: { type: "string", description: "Attach to a shared notification target, which then owns the configuration" },
        events: { type: "array", items: { type: "string" }, description: "Event kinds to fire on; defaults to [\"*\"]. An entry that is not a string makes the whole field fall back to [\"*\"]." },
        transitions: { type: "array", items: { type: "string" }, description: "Restrict deploy.status_changed to these from→to transitions; empty means all of them" },
        enabled: { type: "boolean" },
      },
    },
    HookUpdate: {
      type: "object",
      description:
        "Every field is optional; absent fields are left alone. `type` is accepted and ignored rather than refused. Send `targetId: null` to detach, which requires the hook to end up with a non-empty config — that config is re-validated against the outbound-URL policy at that moment, since detaching is what puts it back in charge of delivery.",
      properties: {
        events: { type: "array", items: { type: "string" } },
        transitions: { type: "array", items: { type: "string" } },
        config: { type: "object", additionalProperties: true },
        targetId: { type: "string", nullable: true, description: "null detaches the current target" },
        enabled: { type: "boolean" },
      },
    },
    HookDelivery: {
      type: "object",
      description: "One queued outbound send. Retries are driven by nextAttemptAt; a claimed row has its nextAttemptAt pushed out by a ten-minute lease while the send is in flight.",
      properties: {
        id: { type: "string" }, hookId: { type: "string" }, kind: { type: "string" },
        status: { type: "string", enum: ["PENDING", "OK", "FAILED", "DEAD"] },
        attempts: { type: "integer" },
        nextAttemptAt: { type: "string", format: "date-time", nullable: true, description: "null on a terminal row (OK or DEAD)" },
        statusCode: { type: "integer", nullable: true },
        error: { type: "string", nullable: true },
        payload: { description: "The snapshotted outbound payload; retries reuse it" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    Environment: {
      type: "object",
      properties: {
        id: { type: "string" }, slug: { type: "string" }, name: { type: "string" },
        color: { type: "string", description: "#rrggbb" },
        sortOrder: { type: "integer" },
        public: { type: "boolean", description: "Visible to anonymous callers in public mode" },
      },
    },
    EnvironmentGroup: {
      type: "object",
      properties: {
        id: { type: "string" }, slug: { type: "string" }, name: { type: "string" },
        members: { type: "array", items: { type: "string" }, description: "Environment slugs" },
        sortOrder: { type: "integer" },
      },
    },
    Tag: {
      type: "object",
      properties: { name: { type: "string" }, color: { type: "string", description: "#rrggbb" } },
    },
    NotificationTarget: {
      type: "object",
      description: "A shared connector configuration several hooks can point at.",
      properties: {
        id: { type: "string" }, type: { type: "string" }, label: { type: "string" },
        config: { type: "object", additionalProperties: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    IngestSource: {
      type: "object",
      properties: {
        id: { type: "string" },
        scope: { type: "string", enum: ["SERVICE", "COMPANY", "GLOBAL"] },
        serviceId: { type: "string", nullable: true },
        companyId: { type: "string", nullable: true },
        label: { type: "string" },
        token: { type: "string", description: "The ingest credential. Returned in full on every read — treat the response as a secret." },
        defaultEnvironment: { type: "string", nullable: true },
        enabled: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    CalendarFeed: {
      type: "object",
      description: "A tokenized ICS feed. Its scope fields narrow what the feed exposes; an empty one means no restriction on that axis.",
      properties: {
        id: { type: "string" }, name: { type: "string" },
        token: { type: "string", description: "Used as /api/v1/calendars/{token}; the token is the whole authorization" },
        company: { type: "string", nullable: true }, product: { type: "string", nullable: true },
        service: { type: "string", nullable: true }, environment: { type: "string", nullable: true },
        types: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    AuditRow: {
      type: "object",
      properties: {
        id: { type: "string" }, at: { type: "string", format: "date-time" },
        action: { type: "string" }, actor: { type: "string", nullable: true },
        actorIp: { type: "string", nullable: true }, target: { type: "string", nullable: true },
        detail: { description: "Action-specific payload" },
        ok: { type: "boolean" },
      },
    },
    DoraBand: { type: "string", enum: ["elite", "high", "medium", "low", "na"] },
    DoraMetrics: {
      type: "object",
      properties: {
        windowDays: { type: "integer" },
        deploy: {
          type: "object",
          properties: { count: { type: "integer" }, perDay: { type: "number" }, band: { $ref: "#/components/schemas/DoraBand" } },
        },
        leadTime: {
          type: "object",
          properties: { medianMs: { type: "integer", nullable: true }, sample: { type: "integer" }, band: { $ref: "#/components/schemas/DoraBand" } },
        },
        changeFailure: {
          type: "object",
          properties: { rate: { type: "number", nullable: true }, failures: { type: "integer" }, total: { type: "integer" }, band: { $ref: "#/components/schemas/DoraBand" } },
        },
        mttr: {
          type: "object",
          properties: { medianMs: { type: "integer", nullable: true }, sample: { type: "integer" }, band: { $ref: "#/components/schemas/DoraBand" } },
        },
      },
    },
    CiDeploymentInput: {
      type: "object",
      required: ["version"],
      description:
        "The CI variant of a deployment body. It differs from DeploymentInput by three defaults — requester \"ci\", changeType NORMAL, deployStatus DEPLOYED — and by resolving the service from the token's scope: a SERVICE-scoped token needs no slugs, a COMPANY-scoped one needs product and service, a GLOBAL one needs all three. `scheduledAt` is required when deployStatus is SCHEDULED.",
      properties: {
        version: { type: "string" },
        company: { type: "string" }, product: { type: "string" }, service: { type: "string" },
        environment: { type: "string", description: "Falls back to the source's defaultEnvironment; must be an active environment either way" },
        requester: { type: "string", default: "ci" },
        changeType: { type: "string", enum: ["POSTMEP_SQL", "HOTFIX", "NORMAL", "PRE_MEP", "POST_MEP"], default: "NORMAL" },
        deployStatus: { type: "string", enum: ["SCHEDULED", "PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE", "GO_CONFIRMED"], default: "DEPLOYED" },
        lot: { type: "string", description: "Defaults to `version`" },
        comment: { type: "string" },
        externalLink: { type: "string", nullable: true },
        scheduledAt: { type: "string", format: "date-time", nullable: true },
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
