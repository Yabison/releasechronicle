-- Incident status enum + column
CREATE TYPE "IncidentStatus" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');
ALTER TABLE "Event" ADD COLUMN "incidentStatus" "IncidentStatus";

-- Backfill incident status from existing resolution state.
UPDATE "Event" SET "incidentStatus" = 'RESOLVED' WHERE "type" = 'INCIDENT' AND "resolvedAt" IS NOT NULL;
UPDATE "Event" SET "incidentStatus" = 'INVESTIGATING' WHERE "type" = 'INCIDENT' AND "resolvedAt" IS NULL;

-- Replace DeployStatus enum values (SUCCESS/FAILED/IN_PROGRESS -> PENDING/IN_PROGRESS/DEPLOYED/INTEST/VALIDATE)
ALTER TYPE "DeployStatus" RENAME TO "DeployStatus_old";
CREATE TYPE "DeployStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DEPLOYED', 'INTEST', 'VALIDATE');
ALTER TABLE "Event" ALTER COLUMN "deployStatus" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "deployStatus" TYPE "DeployStatus" USING (
  CASE "deployStatus"::text
    WHEN 'SUCCESS' THEN 'DEPLOYED'
    WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
    WHEN 'FAILED' THEN 'PENDING'
    ELSE 'DEPLOYED'
  END::"DeployStatus"
);
DROP TYPE "DeployStatus_old";
