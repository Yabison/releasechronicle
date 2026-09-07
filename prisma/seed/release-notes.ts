import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parisDay } from "./mep-tracking";

/**
 * Reader for the hand-kept release-note tree — one folder per release, named by
 * the humans who ran it, holding the note the Azure DevOps generator produced.
 *
 * The tree lives outside the repository (see PRIVATE_PATHS.releaseNotes) and its
 * folder names are the only index there is:
 *
 *   secure 2026-09-03 - Hotfix Security
 *   run secure 2026-02-04 kc-migration
 *   secure 2026-02-18.2
 *
 * An environment (sometimes two, for a release train), a day, and a free label.
 * Never a version — which is the whole difficulty, because a changelog is keyed
 * by service and version. So the join is by **day and environment**, exactly the
 * one mep-tracking.ts already makes against the same folder-naming habits, and
 * for the same reason: it is all the two sides reliably share. The caller walks
 * deployments (which know their service and version) and asks noteFor() whether a
 * note covers each one.
 *
 * Two notes on one day and environment are reported as "ambiguous" rather than
 * resolved by guesswork: attaching the wrong release's text to a version is worse
 * than attaching none, and unlike a missing note it is invisible once written.
 */

export type ReleaseNoteFormat = "markdown" | "html";

export type ReleaseNote = {
  /** Folder name, kept verbatim so the import report names what it read. */
  folder: string;
  /** Uppercased environment slugs; two of them for a release train. */
  environments: string[];
  /** Paris-local day as YYYY-MM-DD, the tree's own granularity. */
  date: string;
  /** Whatever followed the date. Empty when the folder is just env + day. */
  label: string;
  /**
   * The note itself: Markdown, or raw HTML when that is the only format on offer.
   * Both are stored as-is and sanitized at render time by renderChangelog(), which
   * runs the HTML through the same allow-list either way — so no conversion step
   * stands between the file and the page, and hardening the list still applies
   * retroactively.
   */
  body: string;
  format: ReleaseNoteFormat;
  sourcePath: string;
};

/**
 * Reduce a generator HTML note to something the changelog can store.
 *
 * The notes are whole documents — doctype, head, a style block, everything
 * indented two levels in. Stored verbatim they render as their own source:
 * renderChangelog() runs Markdown first, and Markdown reads any line indented four
 * spaces as a code block, so the note came out as nine blocks of escaped tags with
 * the <title> leaking in as loose text above them.
 *
 * So: keep the body, drop head/script/style, and put it all on one line. HTML does
 * not care about the newlines, and without them Markdown has nothing to mistake
 * for an indented block — it sees raw HTML at column 0 and passes it straight to
 * the sanitizer, which is the only thing that should be deciding what survives.
 */
export function htmlNoteBody(raw: string): string {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw);
  return (body ? body[1] : raw)
    // Removed here rather than left to the sanitizer: sanitize-html drops these
    // two with their text, but only once Markdown has had its turn, and by then an
    // indented <style> has already become a visible code block.
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A release note, whatever the generator called it that day. */
const NOTE_FILE = /^(?:releasenote|changelog)[^\/]*\.(md|html)$/i;

/** `2026-09-03`, optionally followed by the `.2` of a second release that day. */
const DATE = /(\d{4}-\d{2}-\d{2})(?:\.\d+)?/;

/**
 * Split a folder name into the environments, the day and the label.
 *
 * `envSlugs` is passed in rather than hardcoded: the environments are rows in the
 * database, so a list baked in here would silently stop recognising a folder the
 * day someone adds one. A name whose leading words are not environments, or which
 * carries no date, returns null — the import reports it as unread instead of
 * attaching it somewhere plausible.
 */
export function parseReleaseFolder(
  name: string,
  envSlugs: string[],
): { environments: string[]; date: string; label: string } | null {
  const known = new Set(envSlugs.map((s) => s.toUpperCase()));
  const words = name.trim().split(/\s+/);

  const environments: string[] = [];
  let i = 0;
  while (i < words.length && known.has(words[i].toUpperCase())) {
    environments.push(words[i].toUpperCase());
    i++;
  }
  if (environments.length === 0) return null;

  const rest = words.slice(i);
  if (rest.length === 0) return null;
  const date = DATE.exec(rest[0]);
  // The date must be the token right after the environments: finding one further
  // along would mean the name is shaped differently than assumed, and guessing
  // which of several numbers is the release day is how wrong notes get attached.
  if (!date || date.index !== 0) return null;

  // Drop a leading separator so "- Hotfix Security" reads as the label itself.
  const label = rest.slice(1).join(" ").replace(/^[-–—:]\s*/, "").trim();
  return { environments, date: date[1], label };
}

/**
 * Every readable note under `dir`, newest folder first is *not* guaranteed — the
 * caller matches by day, so order carries no meaning.
 *
 * A missing directory yields nothing rather than throwing: the tree is optional
 * input, and a seeder that refuses to run because someone has no local copy of it
 * would be worse than one that imports no notes.
 */
export function readReleaseNotes(dir: string, envSlugs: string[]): ReleaseNote[] {
  if (!existsSync(dir)) return [];

  const notes: ReleaseNote[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const parsed = parseReleaseFolder(entry.name, envSlugs);
    if (!parsed) continue;

    const folderPath = join(dir, entry.name);
    const files = readdirSync(folderPath).filter((f) => NOTE_FILE.test(f)).sort();
    // Markdown wins over HTML in the same folder: it is the format the changelog
    // stores, so taking it means no conversion can lose a table or a link.
    const md = files.find((f) => f.toLowerCase().endsWith(".md"));
    const chosen = md ?? files.find((f) => f.toLowerCase().endsWith(".html"));
    if (!chosen) continue;

    const contents = readFileSync(join(folderPath, chosen), "utf8");
    notes.push({
      folder: entry.name,
      environments: parsed.environments,
      date: parsed.date,
      label: parsed.label,
      body: md ? contents : htmlNoteBody(contents),
      format: md ? "markdown" : "html",
      sourcePath: join(folderPath, chosen),
    });
  }
  return notes;
}

/**
 * The note covering a deployment, `null` when the tree says nothing about it, or
 * "ambiguous" when the day holds notes that disagree.
 *
 * Mirrors mepFor(): same join, same refusal to arbitrate. Identical bodies are not
 * a disagreement — a release split across two folders repeats its note — so those
 * resolve to the first.
 */
export function noteFor(
  notes: ReleaseNote[],
  environment: string,
  at: Date,
): ReleaseNote | null | "ambiguous" {
  const day = parisDay(at);
  const env = environment.toUpperCase();
  const sameDay = notes.filter((n) => n.date === day && n.environments.includes(env));
  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0];
  return new Set(sameDay.map((n) => n.body)).size === 1 ? sameDay[0] : "ambiguous";
}

/** A deployment as the planner needs it: who was deployed, what, where and when. */
export type Deployment = {
  serviceId: string;
  /** Only for the report; the upsert keys on serviceId. */
  serviceSlug: string;
  version: string | null;
  environment: string;
  occurredAt: Date;
};

export type ImportPlan = {
  /** Ready to upsert: one entry per service and version. */
  attach: { serviceId: string; serviceSlug: string; version: string; body: string; folder: string }[];
  /** A day holding notes that disagree — nothing written for it. */
  ambiguous: { environment: string; date: string; serviceSlug: string; version: string }[];
  /** One version two different notes would claim — nothing written for it. */
  conflicts: { serviceSlug: string; version: string; folders: string[] }[];
  /** Notes no deployment matched, so nothing carries them. */
  unmatched: ReleaseNote[];
};

/**
 * Turn notes plus deployments into the set of changelog rows to write.
 *
 * Walking deployments rather than notes is what makes the service and the version
 * knowable at all: a folder name has neither, a deployment has both. A release
 * train that shipped nine services on one day therefore attaches its note to all
 * nine — which is the faithful reading, the note describing the release and not
 * one component of it.
 *
 * Two refusals, both reported and neither written:
 *
 * - `ambiguous`, when the day carries notes that disagree (noteFor decides).
 * - `conflicts`, when one service+version is claimed by two different notes. A
 *   build promoted from RUN to SECURE the next day hits this whenever the two days
 *   have their own notes; the changelog is keyed by service and version alone, so
 *   there is no honest way to hold both texts, and letting the later day win would
 *   silently overwrite the earlier one.
 */
export function planReleaseNoteImport(notes: ReleaseNote[], deployments: Deployment[]): ImportPlan {
  const plan: ImportPlan = { attach: [], ambiguous: [], conflicts: [], unmatched: [] };
  /** serviceId\0version -> the notes claiming it, deduplicated by body. */
  const claims = new Map<string, { serviceSlug: string; version: string; notes: ReleaseNote[] }>();
  const used = new Set<string>();

  for (const d of deployments) {
    if (!d.version) continue;
    const found = noteFor(notes, d.environment, d.occurredAt);
    if (found === null) continue;
    if (found === "ambiguous") {
      plan.ambiguous.push({
        environment: d.environment.toUpperCase(),
        date: parisDay(d.occurredAt),
        serviceSlug: d.serviceSlug,
        version: d.version,
      });
      continue;
    }
    used.add(found.sourcePath);
    const key = `${d.serviceId}\0${d.version}`;
    const claim = claims.get(key) ?? { serviceSlug: d.serviceSlug, version: d.version, notes: [] };
    if (!claim.notes.some((n) => n.body === found.body)) claim.notes.push(found);
    claims.set(key, claim);
  }

  for (const [key, claim] of claims) {
    const [serviceId] = key.split("\0");
    if (claim.notes.length > 1) {
      plan.conflicts.push({
        serviceSlug: claim.serviceSlug,
        version: claim.version,
        folders: claim.notes.map((n) => n.folder).sort(),
      });
      continue;
    }
    plan.attach.push({
      serviceId,
      serviceSlug: claim.serviceSlug,
      version: claim.version,
      body: claim.notes[0].body,
      folder: claim.notes[0].folder,
    });
  }

  plan.unmatched = notes.filter((n) => !used.has(n.sourcePath));
  return plan;
}
