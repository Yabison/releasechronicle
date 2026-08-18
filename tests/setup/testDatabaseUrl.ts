/**
 * Single source of truth for the test database URL. `vitest.config.ts` injects
 * this into `test.env.DATABASE_URL` (authoritative for test files — see the
 * comment there), and `globalSetup.ts` imports the same constant so the
 * preflight checks a live db/db_test container on the exact URL the suite
 * will actually use, without depending on whether `test.env` is visible in
 * globalSetup's process (it runs outside the worker pool).
 */
export const TEST_DATABASE_URL = "postgresql://rc:rc@localhost:5433/releasechronicle_test";
