import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

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
    // Inject test DB URL before any module (including the Prisma singleton) loads.
    // Static ESM imports are hoisted above dotenv config() calls, so the env
    // must be set at the config level to guarantee the PrismaClient picks it up.
    env: {
      DATABASE_URL: "postgresql://rc:rc@localhost:5433/releasechronicle_test",
      RC_WRITE_TOKEN: "test-token",
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
