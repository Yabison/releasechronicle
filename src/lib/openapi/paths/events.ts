/** Deployments, incidents, maintenances, and the deployment annotations. */
export const eventPaths = {
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
} as const;
