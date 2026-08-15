CREATE TABLE "EnvironmentConfig" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "EnvironmentConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnvironmentConfig_slug_key" ON "EnvironmentConfig"("slug");

INSERT INTO "EnvironmentConfig" ("id","slug","name","color","sortOrder") VALUES
  (gen_random_uuid()::text,'DEV','DEV',    COALESCE((SELECT color FROM "EnvSetting" WHERE env='DEV'),    '#64748b'), 0),
  (gen_random_uuid()::text,'QA','QA',      COALESCE((SELECT color FROM "EnvSetting" WHERE env='QA'),     '#f59e0b'), 1),
  (gen_random_uuid()::text,'PREPROD','PREPROD',COALESCE((SELECT color FROM "EnvSetting" WHERE env='PREPROD'),'#f97316'), 2),
  (gen_random_uuid()::text,'PROD','PROD',  COALESCE((SELECT color FROM "EnvSetting" WHERE env='PROD'),   '#22c55e'), 3),
  (gen_random_uuid()::text,'RUN','RUN',    COALESCE((SELECT color FROM "EnvSetting" WHERE env='RUN'),    '#3b82f6'), 4),
  (gen_random_uuid()::text,'SECURE','SECURE',COALESCE((SELECT color FROM "EnvSetting" WHERE env='SECURE'),'#8b5cf6'), 5);

ALTER TABLE "Event" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;
ALTER TABLE "IngestSource" ALTER COLUMN "defaultEnvironment" TYPE TEXT USING "defaultEnvironment"::text;
ALTER TABLE "Product" ALTER COLUMN "envWorkflow" TYPE TEXT[] USING "envWorkflow"::text[];
