import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import ExcelJS from "exceljs";
import { PrismaClient, type Prisma, type DeployStatus } from "@prisma/client";
import { slugify } from "../src/lib/slug";
import { wipeAll } from "./wipe";
import { seedHierarchy, type HierarchySeed } from "./seed/hierarchy";
import { PRIVATE_PATHS, requirePrivateFile } from "./seed/private";
import { parseRundeckCsv, type ImportRow } from "./seed/rundeck-csv";
import { mergeCanary } from "./seed/canary";
import { hourType } from "./seed/hourType";
import { detectRollbacks, ROLLBACK_ENVIRONMENTS, type BuildPoint } from "./seed/rollbacks";
import { readMepTracking, mepFor, type Mep } from "./seed/mep-tracking";

/**
 * Real-data seeder. Every input lives under `private/` and is gitignored, so this
 * file describes *how* to load them and never contains the data itself — see
 * prisma/seed-demo.ts for the publishable dataset.
 *
 *   hierarchy.yml           companies / products / services
 *   the deployment export   a raw rundeck `.csv` or an app-shaped `.xlsx`
 *   the MEP tracking sheet  optional; says which releases were hotfixes
 *
 * Two things the export cannot say on its own:
 *
 * - A deployment sometimes reaches production in several chained runs. Consecutive
 *   rows with the SAME service + environment + version, each within 60 min of the
 *   previous, collapse into ONE event (seed/canary.ts) — occurredAt = first run,
 *   the status trail ends when the last one finished. Without that, the frequency
 *   metric counts one release five times.
 * - Whether a release was a hotfix, which only the tracking sheet knows.
 *
 * Everything that reached production is treated as tested: a successful deployment
 * ends at VALIDATE, unless it was rolled back.
 *
 * Pass --config-only to build the hierarchy without importing any events.
 */

// Branch defaults that are not real lot names.
const IGNORED_LOTS = new Set(["next", "master"]);

/** Sanitize a lot name; drop branch defaults (next/master) → no lot. */
function cleanLot(raw: string | null): string | null {
  if (!raw) return null;
  if (IGNORED_LOTS.has(raw.trim().toLowerCase())) return null;
  const s = slugify(raw);
  return s === "" ? null : s;
}

function loadHierarchy(): HierarchySeed {
  const path = requirePrivateFile(PRIVATE_PATHS.hierarchy(), "RC_PRIVATE_HIERARCHY");
  return parse(readFileSync(path, "utf8")) as HierarchySeed;
}

/** Extract a plain string from a cell, unwrapping hyperlink cells ({text, hyperlink}). */
function cellStr(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "text" in v) {
    const t = String((v as { text: unknown }).text).trim();
    return t === "" ? null : t;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Load the export, whichever shape it arrived in: a raw rundeck `.csv` (translated by
 * seed/rundeck-csv.ts) or an `.xlsx` already using the app's column names.
 */
async function readRows(): Promise<ImportRow[]> {
  const path = requirePrivateFile(PRIVATE_PATHS.import(), "RC_PRIVATE_IMPORT");
  return path.toLowerCase().endsWith(".csv")
    ? parseRundeckCsv(readFileSync(path, "utf8"))
    : readXlsxRows(path);
}

/**
 * The MEP tracking sheet, or an empty list when it is not there. Optional on purpose:
 * without it every deployment simply keeps its rundeck-derived change type, which is
 * a lesser import rather than a broken one.
 */
async function readMeps(): Promise<Mep[]> {
  const path = PRIVATE_PATHS.mepTracking();
  if (!existsSync(path)) {
    console.log(`No MEP tracking sheet at ${path} — importing without hotfix information.`);
    return [];
  }
  return readMepTracking(path);
}

async function readXlsxRows(path: string): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const hdr: string[] = [];
  ws.getRow(1).eachCell((c, i) => (hdr[i] = String(c.value ?? "")));
  const col = (name: string) => hdr.indexOf(name);
  const iOcc = col("occurredAt"), iProd = col("product"), iEnv = col("environment");
  const iExtId = col("externalId"), iVer = col("version"), iLot = col("lot");
  const iReq = col("requester"), iChg = col("changeType"), iStat = col("deployStatus");
  const iLink = col("externalLink"), iCom = col("comment");

  const rows: ImportRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const occ = cellStr(row.getCell(iOcc).value);
    const product = cellStr(row.getCell(iProd).value);
    if (!occ || !product) continue;
    rows.push({
      product,
      environment: (cellStr(row.getCell(iEnv).value) ?? "RUN").toUpperCase(),
      externalId: cellStr(row.getCell(iExtId).value),
      occurredAt: new Date(occ),
      // The app-shaped export carries no run end; the DEPLOYED transition falls back
      // to the step's own timestamp, as it did before the CSV reader existed.
      finishedAt: null,
      version: cellStr(row.getCell(iVer).value),
      // No separate build column in the app-shaped export: its version is the build
      // number, which is what the rollback heuristic used before the CSV reader.
      build: cellStr(row.getCell(iVer).value),
      lot: cellStr(row.getCell(iLot).value),
      requester: cellStr(row.getCell(iReq).value),
      changeType: cellStr(row.getCell(iChg).value),
      deployStatus: cellStr(row.getCell(iStat).value),
      externalLink: cellStr(row.getCell(iLink).value),
      comment: cellStr(row.getCell(iCom).value),
      tags: [],
    });
  }
  return rows;
}

function mapStatus(s: string | null): { status: DeployStatus; tag: string | null; deployed: boolean } {
  switch (s) {
    case "SUCCESS": return { status: "DEPLOYED", tag: null, deployed: true };
    case "FAILED": return { status: "IN_PROGRESS", tag: "failed", deployed: false };
    case "ABORTED": return { status: "PENDING", tag: "aborted", deployed: false };
    default: return { status: "PENDING", tag: null, deployed: false };
  }
}

/**
 * Everything that reached production was tested, so a successful deployment ends at
 * VALIDATE and carries the whole trail — unless it was rolled back, which is the one
 * outcome that is not a validation: those stop at DEPLOYED and keep their annotation.
 */
const VALIDATED_CHAIN: DeployStatus[] = ["PENDING", "IN_PROGRESS", "DEPLOYED", "TESTING", "VALIDATE"];

/**
 * The status history of a completed deployment.
 *
 * PENDING and IN_PROGRESS sit at the start of the run, everything from DEPLOYED on at
 * its end. TESTING and VALIDATE share that instant rather than being spread out: the
 * export records no recette, and inventing a duration would put fabricated numbers
 * next to measured ones.
 */
function chainFor(
  eventId: string, actorName: string, startedAt: Date, endedAt: Date, upTo: DeployStatus,
): Prisma.StatusTransitionCreateManyInput[] {
  const last = VALIDATED_CHAIN.indexOf(upTo);
  const out: Prisma.StatusTransitionCreateManyInput[] = [];
  for (let i = 0; i <= last; i++) {
    out.push({
      eventId,
      fromStatus: i === 0 ? null : VALIDATED_CHAIN[i - 1],
      toStatus: VALIDATED_CHAIN[i],
      actorName,
      createdAt: i < 2 ? startedAt : endedAt,
    });
  }
  return out;
}

async function main() {
  const configOnly = process.argv.includes("--config-only");
  const prisma = new PrismaClient();
  try {
    const hierarchy = loadHierarchy();
    const rows = configOnly ? [] : await readRows();
    const meps = configOnly ? [] : await readMeps();

    await wipeAll(prisma);
    const { serviceBySlug, companies, products, services } = await seedHierarchy(prisma, hierarchy);

    if (configOnly) {
      console.log(`Seeded config: ${companies} companies, ${products} products, ${services} services.`);
      return;
    }

    const merged = mergeCanary(rows);

    const eventsData: Prisma.EventCreateManyInput[] = [];
    const transitions: Prisma.StatusTransitionCreateManyInput[] = [];
    const rollbacks: Prisma.RollbackCreateManyInput[] = [];
    const buildPoints: BuildPoint[] = [];
    let i = 0, skipped = 0;
    let validated = 0, hotfixes = 0, sheetRollbacks = 0, ambiguous = 0;
    const hours = { HO: 0, HNO: 0 };

    for (const m of merged) {
      const serviceId = serviceBySlug.get(m.last.product); // product slug == service slug
      if (!serviceId) { skipped++; continue; }
      const id = `imp-${i++}`;
      const st = mapStatus(m.last.deployStatus);
      const startedAt = m.first;
      const endedAt = m.last.finishedAt ?? m.last.occurredAt;

      // What the tracking sheet says this release was. Deployments it does not cover
      // keep their rundeck-derived change type.
      const mep = meps.length ? mepFor(meps, m.last.environment, startedAt) : null;
      if (mep === "ambiguous") ambiguous++;
      const tracked = mep === "ambiguous" ? null : mep;
      if (tracked?.rolledBack) sheetRollbacks++;

      const rolledBack = m.rollback || (tracked?.rolledBack ?? false);
      // Rolled back is the one outcome that is not a validation.
      const status: DeployStatus = st.deployed && !rolledBack ? "VALIDATE" : st.status;
      if (status === "VALIDATE") validated++;
      if (tracked?.hotfix) hotfixes++;

      const hour = hourType(startedAt);
      hours[hour]++;
      buildPoints.push({
        id, serviceId, environment: m.last.environment, at: startedAt, build: m.last.build,
      });

      // Tags the reader put on any step (e.g. "config-only") survive the merge.
      const tags: string[] = [...m.tags];
      if (st.tag) tags.push(st.tag);
      eventsData.push({
        id,
        serviceId,
        environment: m.last.environment,
        type: "DEPLOYMENT",
        occurredAt: startedAt,
        source: "API",
        externalId: m.last.externalId,
        version: m.last.version,
        lot: cleanLot(m.last.lot),
        requester: m.last.requester,
        hourType: hour,
        // A rollout that reverted something is not a NORMAL change; the Rollback
        // annotation below carries what it actually was.
        changeType: tracked?.hotfix ? "HOTFIX" : rolledBack ? null : m.last.changeType === "NORMAL" ? "NORMAL" : null,
        deployStatus: status,
        externalLink: m.last.externalLink,
        comment: m.last.comment,
        tags,
      });
      if (st.deployed) {
        // The trail ends when the last step *finished*, so lead time spans the whole
        // rollout, run duration included. An export without an end time (xlsx) falls
        // back to the step's start, which only ever under-reports.
        transitions.push(
          ...chainFor(id, m.last.requester ?? "rundeck", startedAt, endedAt, status),
        );
      }
      if (rolledBack) {
        rollbacks.push({
          eventId: id,
          comment: m.rollback ? "Rollback (import)" : "Rollback (suivi des MEP)",
        });
      }
    }

    // Build-number rollback detection: tag the reverted (higher) build "rollback".
    const flagged = detectRollbacks(buildPoints);
    let taggedRollbacks = 0;
    for (const e of eventsData) {
      if (flagged.has(e.id as string)) {
        const t = e.tags as string[];
        if (!t.includes("rollback")) { t.push("rollback"); taggedRollbacks++; }
      }
    }

    await prisma.event.createMany({ data: eventsData });
    if (transitions.length) await prisma.statusTransition.createMany({ data: transitions });
    if (rollbacks.length) await prisma.rollback.createMany({ data: rollbacks });

    console.log(
      [
        `Imported: ${rows.length} rows -> ${eventsData.length} deployments, ${skipped} skipped (no service).`,
        `  status:    ${validated} validated, ${transitions.length} status transitions.`,
        `  hours:     ${hours.HO} HO, ${hours.HNO} HNO (09:00-18:00 Mon-Fri, Europe/Paris).`,
        `  hotfix:    ${hotfixes} deployments marked, from ${meps.length} tracked MEPs` +
          (ambiguous ? `; ${ambiguous} left NORMAL (same-day MEPs disagree, no hour to arbitrate).` : "."),
        `  rollbacks: ${rollbacks.length} annotated (${sheetRollbacks} from the MEP sheet), ` +
          `${taggedRollbacks} tagged from build numbers in ${[...ROLLBACK_ENVIRONMENTS].join("/")}.`,
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
