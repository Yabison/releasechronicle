import config from "../../release-please-config.json";

/**
 * The version the next release will carry, derived from the Conventional Commits
 * landed since the last one.
 *
 * release-please owns the real number, but it only computes it on `main`, when the
 * release pull request is merged. The rc branch needs the same number *before*
 * that, to tag its images `rc-<version>` and to show it in the UI — so the rules
 * below mirror release-please's, and read what they can straight from
 * release-please-config.json rather than keeping a second copy.
 */

const pkg = config.packages["."];

/** Types that produce a release. A hidden section is one release-please keeps out
 *  of the changelog, and those do not trigger a release on their own either. */
const RELEASABLE: ReadonlySet<string> = new Set(
  pkg["changelog-sections"].filter((s) => !("hidden" in s && s.hidden)).map((s) => s.type),
);

const HEADER = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?:\s/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

export type Bump = "major" | "minor" | "patch" | "none";

function isPreMajor(current: string): boolean {
  return current.startsWith("0.");
}

/** The largest bump the given commit messages call for. */
export function bumpFor(messages: string[], current: string): Bump {
  const preMajor = isPreMajor(current);
  let bump: Bump = "none";

  for (const message of messages) {
    const [header, ...body] = message.split("\n");
    const match = HEADER.exec(header.trim());
    if (!match?.groups) continue;
    const type = match.groups.type;

    if (match.groups.breaking || BREAKING_FOOTER.test(body.join("\n"))) {
      // Nothing outranks this, so the answer cannot change afterwards.
      // Below 1.0.0 release-please holds it to a minor unless asked otherwise.
      return preMajor && !pkg["bump-patch-for-minor-pre-major"] ? "minor" : "major";
    }

    if (!RELEASABLE.has(type)) continue;

    if (type === "feat" && (!preMajor || pkg["bump-minor-pre-major"])) bump = "minor";
    else if (bump === "none") bump = "patch";
  }

  return bump;
}

/** `current` bumped for those commits, or `current` when none of them releases. */
export function nextVersion(current: string, messages: string[]): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (bumpFor(messages, current)) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return current;
  }
}

/**
 * The release-candidate form of a version, numbered.
 *
 * `candidate` distinguishes two builds aimed at the same release: without it every
 * commit on rc would produce the same `rc-0.2.0` tag and quietly overwrite the
 * previous image. `-rc.N` is a semver prerelease, so 0.2.0-rc.7 still ranks below
 * 0.2.0, and N is a numeric identifier — semver compares those numerically, which
 * is what puts rc.10 above rc.9.
 */
export function rcVersion(version: string, candidate: number): string {
  if (!Number.isInteger(candidate) || candidate < 0) {
    throw new Error(`Candidate number must be a non-negative integer, got ${candidate}`);
  }
  return `${version}-rc.${candidate}`;
}
