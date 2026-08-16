/**
 * Prints the version the next release would carry, from the commits since the last
 * `v*` tag. Used by the CI to tag the rc images and to stamp the version the app
 * displays, so `rc-0.2.0` and `release-0.2.0` end up on the same number.
 *
 *   npx tsx scripts/next-version.ts        -> 0.2.0
 *   npx tsx scripts/next-version.ts --rc   -> 0.2.0-rc
 *
 * Needs the tags, so the CI checkout must use fetch-depth: 0.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { nextVersion, rcVersion } from "../src/lib/version";

function git(...args: string[]): string {
  // stderr dropped: `git describe` complains loudly before the first release tag,
  // which is a normal state here, not something to print in a CI log.
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function lastReleaseTag(): string | null {
  try {
    return git("describe", "--tags", "--match", "v*", "--abbrev=0").trim() || null;
  } catch {
    // No release yet: every commit counts.
    return null;
  }
}

function messagesSinceLastRelease(): string[] {
  const tag = lastReleaseTag();
  // %B is the raw body (header + body), NUL-separated so a message can hold blank lines.
  const log = git("log", ...(tag ? [`${tag}..HEAD`] : []), "--format=%B%x00");
  return log
    .split("\0")
    .map((m) => m.trim())
    .filter(Boolean);
}

const current = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const next = nextVersion(current, messagesSinceLastRelease());

process.stdout.write(process.argv.includes("--rc") ? rcVersion(next) : next);
