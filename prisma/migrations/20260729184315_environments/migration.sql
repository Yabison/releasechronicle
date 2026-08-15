-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Environment" ADD VALUE 'RUN';
ALTER TYPE "Environment" ADD VALUE 'SECURE';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "envWorkflow" "Environment"[] DEFAULT ARRAY[]::"Environment"[];

-- CreateTable
CREATE TABLE "EnvSetting" (
    "env" "Environment" NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "EnvSetting_pkey" PRIMARY KEY ("env")
);
