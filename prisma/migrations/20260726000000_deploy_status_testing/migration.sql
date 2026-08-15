-- Rename DeployStatus enum value INTEST -> TESTING (clearer name; no behavior change).
ALTER TYPE "DeployStatus" RENAME VALUE 'INTEST' TO 'TESTING';
