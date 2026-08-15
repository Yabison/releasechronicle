-- Rename ChangeType 'CAB' -> 'POSTMEP_SQL'
ALTER TYPE "ChangeType" RENAME VALUE 'CAB' TO 'POSTMEP_SQL';

-- Repair a dangling default left by the dynamic-environments migration
-- (Product.envWorkflow default referenced the since-dropped "Environment" enum type,
--  which broke catalog introspection / prisma migrate dev).
ALTER TABLE "Product" ALTER COLUMN "envWorkflow" SET DEFAULT ARRAY[]::text[];
