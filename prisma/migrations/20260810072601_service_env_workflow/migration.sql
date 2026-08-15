-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "envWorkflow" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "envWorkflowOverride" BOOLEAN NOT NULL DEFAULT false;

