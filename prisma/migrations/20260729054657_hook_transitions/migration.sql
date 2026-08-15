-- AlterTable
ALTER TABLE "Hook" ADD COLUMN     "transitions" TEXT[] DEFAULT ARRAY[]::TEXT[];
