-- CreateTable
CREATE TABLE "RuntimeState" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "build" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuntimeState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeState_serviceId_environment_key" ON "RuntimeState"("serviceId", "environment");

-- AddForeignKey
ALTER TABLE "RuntimeState" ADD CONSTRAINT "RuntimeState_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

