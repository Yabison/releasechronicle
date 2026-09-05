import { existsSync, readdirSync } from "node:fs";
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

const IMPORT_DIR = "private/import";
const IMPORT_EXT = /\.(csv|xlsx)$/i;
const MEP_TRACKING_FILE = "Suivi des MEPs.xlsx";

export const PRIVATE_PATHS = {
  hierarchy: () => process.env.RC_PRIVATE_HIERARCHY ?? root("private/hierarchy.yml"),
  /**
   * The MEP tracking sheet: one row per production release, saying whether it was a
   * hotfix. Optional — without it deployments simply carry no hotfix information —
   * so callers test existsSync() rather than requirePrivateFile().
   */
  mepTracking: () =>
    process.env.RC_PRIVATE_MEP_TRACKING ?? join(root(IMPORT_DIR), MEP_TRACKING_FILE),
  /**
   * The deployment export, .csv (raw rundeck) or .xlsx (already in the app's shape).
   *
   * There is no fixed default filename: the file is whatever was exported that day,
   * so `private/import/` is expected to hold exactly one of them. Two files is an
   * error rather than a guess — importing last month's export by alphabetical luck
   * is the kind of thing nobody notices until the metrics look wrong. The MEP
   * tracking sheet lives in the same directory and is a different input, so it does
   * not count towards that one.
   */
  import: () => {
    const override = process.env.RC_PRIVATE_IMPORT;
    if (override) return override;

    const dir = root(IMPORT_DIR);
    if (!existsSync(dir)) return join(dir, "<export>.csv");

    const found = readdirSync(dir)
      .filter((f) => IMPORT_EXT.test(f) && f !== MEP_TRACKING_FILE)
      .sort();
    if (found.length === 1) return join(dir, found[0]);
    if (found.length === 0) return join(dir, "<export>.csv");
    throw new Error(
      [
        `Ambiguous private seed input: ${IMPORT_DIR}/ holds ${found.length} exports.`,
        "",
        found.map((f) => `  - ${f}`).join("\n"),
        "",
        "Leave exactly one .csv or .xlsx there, or point RC_PRIVATE_IMPORT at the one to use.",
      ].join("\n"),
    );
  },
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
