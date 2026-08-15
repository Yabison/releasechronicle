-- CreateTable
CREATE TABLE "Hook" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "events" TEXT[],
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HookDelivery" (
    "id" TEXT NOT NULL,
    "hookId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hook_productId_idx" ON "Hook"("productId");

-- CreateIndex
CREATE INDEX "HookDelivery_hookId_createdAt_idx" ON "HookDelivery"("hookId", "createdAt");

-- AddForeignKey
ALTER TABLE "Hook" ADD CONSTRAINT "Hook_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookDelivery" ADD CONSTRAINT "HookDelivery_hookId_fkey" FOREIGN KEY ("hookId") REFERENCES "Hook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
