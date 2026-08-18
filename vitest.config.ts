import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { TEST_DATABASE_URL } from "./tests/setup/testDatabaseUrl";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Git worktrees live under .claude/worktrees/; their test files would otherwise
    // be collected here and resolve "@" against this checkout's src, not their own.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
    // Run DB-backed test files serially to avoid concurrent resetDb() collisions
    // on the shared test DB (port 5433).
    fileParallelism: false,
    // Runs once before the whole suite (own process, outside the worker pool):
    // takes an exclusive cross-process lock keyed on DATABASE_URL (so a second
    // concurrent `npm test` refuses to start instead of corrupting both runs
    // via racing resetDb() calls), then preflights db reachability + migration
    // state so a broken environment fails in one line instead of 55 silent
    // seconds of "no tests" collection failures.
    globalSetup: ["./tests/setup/globalSetup.ts"],
    // Inject test DB URL before any module (including the Prisma singleton) loads.
    // Static ESM imports are hoisted above dotenv config() calls, so the env
    // must be set at the config level to guarantee the PrismaClient picks it up.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      RC_WRITE_TOKEN: "test-token",
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
