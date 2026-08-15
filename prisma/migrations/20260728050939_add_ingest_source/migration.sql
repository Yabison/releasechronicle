-- CreateTable
CREATE TABLE "IngestSource" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "defaultEnvironment" "Environment" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestSource_token_key" ON "IngestSource"("token");

-- CreateIndex
CREATE INDEX "IngestSource_serviceId_idx" ON "IngestSource"("serviceId");

-- AddForeignKey
ALTER TABLE "IngestSource" ADD CONSTRAINT "IngestSource_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
