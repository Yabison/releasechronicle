import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolver for the real (non-publishable) seed inputs.
 *
 * Customer hierarchy names and rundeck exports live under `private/`, which is
 * gitignored, so the repository itself carries no production data and can be
 * published. Every path is overridable by env var for deployments that mount the
 * files elsewhere.
 *
 * Missing files fail loudly and point at the demo seeder, because "seeded nothing"
 * is far more confusing than "this seeder needs data you do not have".
 */
const root = (p: string) => join(process.cwd(), p);

export const PRIVATE_PATHS = {
  hierarchy: () => process.env.RC_PRIVATE_HIERARCHY ?? root("private/hierarchy.yml"),
  xlsx: () => process.env.RC_PRIVATE_IMPORT ?? root("private/deployments.xlsx"),
};

export function requirePrivateFile(path: string, envVar: string): string {
  if (existsSync(path)) return path;
  throw new Error(
    [
      `Missing private seed input: ${path}`,
      "",
      "This seeder loads real customer data, which is deliberately kept out of the",
      `repository. Put the file in place or point ${envVar} at it.`,
      "",
      "For a publishable dataset, run the demo seeder instead:  npm run db:seed:demo",
    ].join("\n"),
  );
}
