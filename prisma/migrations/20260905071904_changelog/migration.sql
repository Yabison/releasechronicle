-- CreateEnum
CREATE TYPE "ChangelogVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED');

-- CreateEnum
CREATE TYPE "ChangelogSource" AS ENUM ('CI', 'UI');

-- AlterTable
ALTER TABLE "PublicSetting" ADD COLUMN     "changelogVisibility" "ChangelogVisibility" NOT NULL DEFAULT 'AUTHENTICATED';

-- CreateTable
CREATE TABLE "Changelog" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" "ChangelogSource" NOT NULL DEFAULT 'CI',
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Changelog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Changelog_serviceId_idx" ON "Changelog"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Changelog_serviceId_version_key" ON "Changelog"("serviceId", "version");

-- AddForeignKey
ALTER TABLE "Changelog" ADD CONSTRAINT "Changelog_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
