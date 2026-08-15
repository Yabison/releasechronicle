-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "actorIp" TEXT,
    "target" TEXT,
    "detail" JSONB,
    "ok" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTokenUse" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedIp" TEXT,

    CONSTRAINT "ActionTokenUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_action_at_idx" ON "AuditLog"("action", "at");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTokenUse_jti_key" ON "ActionTokenUse"("jti");

-- CreateIndex
CREATE INDEX "ActionTokenUse_usedAt_idx" ON "ActionTokenUse"("usedAt");
