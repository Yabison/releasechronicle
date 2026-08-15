import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import ExcelJS from "exceljs";
import { PrismaClient, type Prisma, type DeployStatus } from "@prisma/client";
import { slugify } from "../src/lib/slug";
import { wipeAll } from "./wipe";
import { seedHierarchy, type HierarchySeed } from "./seed/hierarchy";
import { PRIVATE_PATHS, requirePrivateFile } from "./seed/private";

/**
 * Real-data seeder. Both inputs live under `private/` and are gitignored, so this
 * file describes *how* to load them and never contains the data itself — see
 * prisma/seed-demo.ts for the publishable dataset.
 *
 * Canary merge: a deployment sometimes happens in several chained steps (canary
 * rollout). Consecutive rows with the SAME service + environment + version, each
 * within 60 min of the previous, collapse into ONE event — occurredAt = first step,
 * DEPLOYED at = last step, status/link/requester = last step, tagged "canary".
 *
 * Pass --config-only to build the hierarchy without importing any events.
 */

const CANARY_GAP_MS = 60 * 60_000;

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

type Row = {
  product: string;
  environment: string;
  externalId: string | null;
  occurredAt: Date;
  version: string | null;
  lot: string | null;
  requester: string | null;
  changeType: string | null;
  deployStatus: string | null;
  externalLink: string | null;
  comment: string | null;
};

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

async function readRows(): Promise<Row[]> {
  const path = requirePrivateFile(PRIVATE_PATHS.xlsx(), "RC_PRIVATE_IMPORT");
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

  const rows: Row[] = [];
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
      version: cellStr(row.getCell(iVer).value),
      lot: cellStr(row.getCell(iLot).value),
      requester: cellStr(row.getCell(iReq).value),
      changeType: cellStr(row.getCell(iChg).value),
      deployStatus: cellStr(row.getCell(iStat).value),
      externalLink: cellStr(row.getCell(iLink).value),
      comment: cellStr(row.getCell(iCom).value),
    });
  }
  return rows;
}

function parseBuild(v: string | null | undefined): number | null {
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : null;
}

/**
 * Detect rollbacks from build numbers: per service+environment, chronological, a deploy whose
 * (numeric) build is lower than the immediately previous one means that previous, higher build
 * was reverted — flag the intermediate (higher) build. Returns the set of eventIds to tag.
 */
function detectRollbacks(events: Prisma.EventCreateManyInput[]): Set<string> {
  const groups = new Map<string, { id: string; at: number; build: number }[]>();
  for (const e of events) {
    const build = parseBuild(e.version as string | null);
    if (build === null) continue;
    const key = `${e.serviceId}|${e.environment}`;
    let list = groups.get(key);
    if (!list) { list = []; groups.set(key, list); }
    list.push({ id: e.id as string, at: new Date(e.occurredAt as Date).getTime(), build });
  }
  const flagged = new Set<string>();
  for (const list of groups.values()) {
    list.sort((a, b) => a.at - b.at);
    for (let i = 1; i < list.length; i++) {
      if (list[i].build < list[i - 1].build) flagged.add(list[i - 1].id);
    }
  }
  return flagged;
}

function mapStatus(s: string | null): { status: DeployStatus; tag: string | null; deployed: boolean } {
  switch (s) {
    case "SUCCESS": return { status: "DEPLOYED", tag: null, deployed: true };
    case "FAILED": return { status: "IN_PROGRESS", tag: "failed", deployed: false };
    case "ABORTED": return { status: "PENDING", tag: "aborted", deployed: false };
    default: return { status: "PENDING", tag: null, deployed: false };
  }
}

/** A canary rollout collapsed to one logical deployment. */
type Merged = { first: Date; last: Row; steps: number };

/**
 * Collapse chained canary steps. Rows are grouped by service+env+version, sorted by time;
 * consecutive steps within CANARY_GAP_MS join the same rollout, a larger gap starts a new one.
 */
function mergeCanary(rows: Row[]): Merged[] {
  const key = (r: Row) => `${r.product}|${r.environment}|${r.version ?? ""}`;
  const sorted = [...rows].sort((a, b) =>
    a.product.localeCompare(b.product) ||
    a.environment.localeCompare(b.environment) ||
    (a.version ?? "").localeCompare(b.version ?? "") ||
    a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  const out: Merged[] = [];
  let chain: Row[] = [];
  const flush = () => { if (chain.length) out.push({ first: chain[0].occurredAt, last: chain[chain.length - 1], steps: chain.length }); };
  for (const r of sorted) {
    const prev = chain[chain.length - 1];
    if (prev && key(prev) === key(r) && r.occurredAt.getTime() - prev.occurredAt.getTime() < CANARY_GAP_MS) {
      chain.push(r);
    } else {
      flush();
      chain = [r];
    }
  }
  flush();
  return out;
}

async function main() {
  const configOnly = process.argv.includes("--config-only");
  const prisma = new PrismaClient();
  try {
    const hierarchy = loadHierarchy();
    const rows = configOnly ? [] : await readRows();

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
    let i = 0, skipped = 0, canarySteps = 0, canaryEvents = 0;

    for (const m of merged) {
      const serviceId = serviceBySlug.get(m.last.product); // product slug == service slug
      if (!serviceId) { skipped++; continue; }
      const id = `imp-${i++}`;
      const st = mapStatus(m.last.deployStatus);
      const tags: string[] = [];
      if (st.tag) tags.push(st.tag);
      if (m.steps > 1) { tags.push("canary"); canaryEvents++; canarySteps += m.steps - 1; }
      eventsData.push({
        id,
        serviceId,
        environment: m.last.environment,
        type: "DEPLOYMENT",
        occurredAt: m.first,
        source: "API",
        externalId: m.last.externalId,
        version: m.last.version,
        lot: cleanLot(m.last.lot),
        requester: m.last.requester,
        changeType: m.last.changeType === "NORMAL" ? "NORMAL" : null,
        deployStatus: st.status,
        externalLink: m.last.externalLink,
        comment: m.steps > 1 ? `Canari : ${m.steps} étapes` : m.last.comment,
        tags,
      });
      if (st.deployed) {
        // DEPLOYED at the last step → lead time spans the whole canary rollout.
        transitions.push({
          eventId: id, fromStatus: null, toStatus: "DEPLOYED",
          actorName: m.last.requester ?? "rundeck", createdAt: m.last.occurredAt,
        });
      }
      if (m.last.changeType === "ROLLBACK") {
        rollbacks.push({ eventId: id, comment: "Rollback (import)" });
      }
    }

    // Build-number rollback detection: tag the reverted (higher) build "rollback".
    const flagged = detectRollbacks(eventsData);
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
      `Imported: ${rows.length} rows -> ${eventsData.length} deployments ` +
        `(${canaryEvents} canary rollouts collapsing ${canarySteps} extra steps), ` +
        `${transitions.length} deployed transitions, ${rollbacks.length} rollbacks, ` +
        `${taggedRollbacks} tagged "rollback" (build-number detection). ${skipped} skipped (no service).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
