-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('PROD', 'PREPROD', 'QA', 'DEV');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('DEPLOYMENT', 'INCIDENT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('UI', 'API');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('CAB', 'HOTFIX', 'NORMAL');

-- CreateEnum
CREATE TYPE "DeployStatus" AS ENUM ('SUCCESS', 'FAILED', 'IN_PROGRESS');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "type" "EventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "source" "EventSource" NOT NULL DEFAULT 'API',
    "externalId" TEXT,
    "metadata" JSONB,
    "tags" TEXT[],
    "causedById" TEXT,
    "version" TEXT,
    "requester" TEXT,
    "changeType" "ChangeType",
    "externalLink" TEXT,
    "deployStatus" "DeployStatus",
    "incidentType" TEXT,
    "startedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "comment" TEXT,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rollback" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rollback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaValidation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "validatedBy" TEXT NOT NULL,
    "comment" TEXT,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_serviceId_environment_occurredAt_idx" ON "Event"("serviceId", "environment", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_source_externalId_key" ON "Event"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_causedById_fkey" FOREIGN KEY ("causedById") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rollback" ADD CONSTRAINT "Rollback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaValidation" ADD CONSTRAINT "QaValidation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
