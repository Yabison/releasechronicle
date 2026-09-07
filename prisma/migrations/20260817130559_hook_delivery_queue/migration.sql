CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'OK', 'FAILED', 'DEAD');

ALTER TABLE "HookDelivery"
  ADD COLUMN "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Existing rows were one-shot attempts: successes become OK; failures are NOT
-- resurrected as retryable — they become DEAD.
UPDATE "HookDelivery" SET
  "status" = CASE WHEN "ok" THEN 'OK' ELSE 'DEAD' END::"DeliveryStatus",
  "attempts" = 1,
  "updatedAt" = "createdAt";

ALTER TABLE "HookDelivery" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "HookDelivery" DROP COLUMN "ok";

CREATE INDEX "HookDelivery_status_nextAttemptAt_idx" ON "HookDelivery"("status", "nextAttemptAt");
