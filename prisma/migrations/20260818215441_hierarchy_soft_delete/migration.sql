ALTER TABLE "Company" ADD COLUMN "deletedBatch" TEXT;
ALTER TABLE "Product" ADD COLUMN "deletedBatch" TEXT;
ALTER TABLE "Service" ADD COLUMN "deletedBatch" TEXT;

CREATE INDEX "Company_deletedBatch_idx" ON "Company"("deletedBatch");
CREATE INDEX "Product_deletedBatch_idx" ON "Product"("deletedBatch");
CREATE INDEX "Service_deletedBatch_idx" ON "Service"("deletedBatch");

-- The slug uniques become partial so a soft-deleted row stops squatting its name.
-- Cannot fail on pre-existing duplicates: the full indexes being dropped already
-- forbade them.
DROP INDEX "Company_slug_key";
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug") WHERE "deletedAt" IS NULL;

DROP INDEX "Product_companyId_slug_key";
CREATE UNIQUE INDEX "Product_companyId_slug_key" ON "Product"("companyId", "slug") WHERE "deletedAt" IS NULL;
CREATE INDEX "Product_companyId_slug_idx" ON "Product"("companyId", "slug");

DROP INDEX "Service_productId_slug_key";
CREATE UNIQUE INDEX "Service_productId_slug_key" ON "Service"("productId", "slug") WHERE "deletedAt" IS NULL;
CREATE INDEX "Service_productId_slug_idx" ON "Service"("productId", "slug");
