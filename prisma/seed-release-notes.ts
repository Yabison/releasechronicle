import "dotenv/config";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PRIVATE_PATHS } from "./seed/private";
import { readReleaseNotes, planReleaseNoteImport, type Deployment } from "./seed/release-notes";
import { upsertChangelogFromCi } from "../src/lib/changelog";

/**
 * Import the hand-kept release notes into the changelog.
 *
 * The notes live in a folder tree outside the repository, indexed only by
 * environment and day; a changelog row is keyed by service and version. Bridging
 * the two is the whole job, and seed/release-notes.ts holds the rule — the same
 * day+environment join mep-tracking.ts already makes, with the same refusal to
 * arbitrate when a day is ambiguous.
 *
 * A **dry run by default**: it prints what it would write and stops. Pass --write
 * to apply. Importing real text over a page people read is not something to
 * discover afterwards, and the report is the only place the join's guesses can be
 * checked — the whole point of showing "note <folder> -> <service>@<version>" is
 * that a wrong line is obvious to whoever knows the release.
 *
 * Notes already edited by hand in the UI are left alone: the write goes through
 * upsertChangelogFromCi(), which honours that lock.
 */

const prisma = new PrismaClient();

async function main() {
  const write = process.argv.includes("--write");
  const dir = PRIVATE_PATHS.releaseNotes();

  if (!existsSync(dir)) {
    console.log(`No release-note tree at ${dir}`);
    console.log("Point RC_PRIVATE_RELEASE_NOTES at the folder that holds the release folders.");
    return;
  }

  const envSlugs = (await prisma.environmentConfig.findMany({ select: { slug: true } })).map((e) => e.slug);
  const notes = readReleaseNotes(dir, envSlugs);
  console.log(`${notes.length} note(s) read from ${dir}`);
  if (notes.length === 0) return;

  const rows = await prisma.event.findMany({
    where: { type: "DEPLOYMENT", version: { not: null } },
    select: { serviceId: true, version: true, environment: true, occurredAt: true, service: { select: { slug: true } } },
  });
  const deployments: Deployment[] = rows.map((r) => ({
    serviceId: r.serviceId,
    serviceSlug: r.service.slug,
    version: r.version,
    environment: r.environment,
    occurredAt: r.occurredAt,
  }));

  const plan = planReleaseNoteImport(notes, deployments);

  for (const a of plan.attach) console.log(`  attach  ${a.folder}  ->  ${a.serviceSlug}@${a.version}`);
  for (const c of plan.conflicts) {
    console.log(`  CONFLICT  ${c.serviceSlug}@${c.version}  claimed by  ${c.folders.join("  +  ")}`);
  }
  // One line per ambiguous day, not per deployment: nine services deployed on a
  // day with two notes is one problem to fix, printed nine times otherwise.
  for (const day of new Set(plan.ambiguous.map((a) => `${a.environment} ${a.date}`))) {
    console.log(`  AMBIGUOUS  ${day}  holds notes that disagree`);
  }
  for (const n of plan.unmatched) console.log(`  no deployment  ${n.folder}`);

  console.log(
    `\n${plan.attach.length} to write, ${plan.conflicts.length} conflict(s), ` +
      `${new Set(plan.ambiguous.map((a) => `${a.environment} ${a.date}`)).size} ambiguous day(s), ` +
      `${plan.unmatched.length} note(s) matching nothing`,
  );

  if (!write) {
    console.log("\nDry run. Pass --write to apply.");
    return;
  }

  let written = 0;
  let locked = 0;
  for (const a of plan.attach) {
    const { written: ok } = await upsertChangelogFromCi(a.serviceId, a.version, a.body);
    if (ok) written++;
    else locked++;
  }
  console.log(`\n${written} written, ${locked} left as edited by hand`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
