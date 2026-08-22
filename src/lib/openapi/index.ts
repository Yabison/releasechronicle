/**
 * The OpenAPI document, assembled from one module per domain.
 *
 * `@/lib/openapi` resolves here, so the route and the tests import exactly what
 * they did when this was a single file. Add a path to the module that owns its
 * domain — tests/api/openapiCoverage.test.ts fails on a route that reaches
 * neither a path entry nor the documented exclusion list.
 */
import { components } from "./schemas";
import { hierarchyPaths } from "./paths/hierarchy";
import { eventPaths } from "./paths/events";
import { hookPaths } from "./paths/hooks";

export const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "releasechronicle API",
    version: "1.0.0",
    description:
      "API for releasechronicle: hierarchy, events (deployments/incidents/maintenances) with annotations, product build-URL templates, and status-change hooks. Reads are public; writes require a bearer token.",
  },
  components,
  paths: {
    ...hierarchyPaths,
    ...eventPaths,
    ...hookPaths,
  },
} as const;
