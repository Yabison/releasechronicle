-- CreateIndex
CREATE INDEX "Event_parentId_idx" ON "Event"("parentId");

-- CreateIndex
CREATE INDEX "Event_causedById_idx" ON "Event"("causedById");

-- CreateIndex
CREATE INDEX "Event_type_occurredAt_idx" ON "Event"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "Event_deployStatus_scheduledAt_idx" ON "Event"("deployStatus", "scheduledAt");

-- CreateIndex
CREATE INDEX "Hook_targetId_idx" ON "Hook"("targetId");

-- CreateIndex
CREATE INDEX "Observation_eventId_idx" ON "Observation"("eventId");

-- CreateIndex
CREATE INDEX "QaValidation_eventId_idx" ON "QaValidation"("eventId");

-- CreateIndex
CREATE INDEX "Rollback_eventId_idx" ON "Rollback"("eventId");

-- At most ONE open BUILD_DRIFT incident per service+environment. reportRuntimeBuild
-- does check-then-create; under concurrency both callers can read "none open" and
-- both create. Prisma cannot express a partial unique index, hence raw SQL — the
-- code treats the unique violation as "someone else just opened it".
CREATE UNIQUE INDEX "Event_open_build_drift_key" ON "Event"("serviceId", "environment")
WHERE "type" = 'INCIDENT' AND "incidentType" = 'BUILD_DRIFT' AND "resolvedAt" IS NULL AND "deletedAt" IS NULL;
