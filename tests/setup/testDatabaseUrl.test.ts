import { describe, it, expect } from "vitest";
import { TEST_DATABASE_URL } from "./testDatabaseUrl";

/**
 * `vitest.config.ts` spells the test DB URL out inline instead of importing the
 * constant below, because `.dockerignore` excludes `tests` and `next build`
 * type-checks the config — importing across that boundary breaks the image build.
 * That leaves two copies of one value, so this test is the guard: inside a test
 * run, process.env.DATABASE_URL is whatever the config injected, so comparing it
 * to the constant catches any drift immediately.
 */
describe("test database URL", () => {
  it("matches the URL vitest.config.ts injects", () => {
    expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  });
});
