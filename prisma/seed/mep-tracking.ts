import ExcelJS from "exceljs";

/**
 * Reader for the MEP tracking spreadsheet — the human-kept log of production
 * releases, one row per MEP.
 *
 * The rundeck export says what ran; this says what the run *was*. `scope` is the
 * only thing the importer needs from it: a MEP is either the full release train
 * or a hotfix, and rundeck has no idea which. The `rollback` column comes along
 * because the export under-reports it badly (one row, against nine here).
 *
 * The join is by day and environment, because that is all both sides reliably
 * share: the `build` column is filled on 18 rows out of 213. Hours are present on
 * roughly a third and only used to separate the handful of days that carry two
 * MEPs. When two same-day MEPs disagree and neither has an hour, mepFor() returns
 * "ambiguous" rather than picking one — a wrong HOTFIX is worse than none.
 *
 * The `incident/Hotfix` column is deliberately unused: it is retroactive, set on a
 * release that later *needed* a hotfix, so reading it as a hotfix marker would flag
 * exactly the wrong rows.
 */

export type Mep = {
  /** Day as YYYY-MM-DD, the sheet's own granularity. */
  date: string;
  /** Uppercased environment slugs; a "Both" row carries the two of them. */
  environments: string[];
  hotfix: boolean;
  rolledBack: boolean;
  /** Minutes since midnight, Paris time, or null when the sheet left it blank. */
  startMinutes: number | null;
  endMinutes: number | null;
};

/** "Both" means the two production environments of the release train. */
const BOTH = ["RUN", "SECURE"];

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Paris-local day of an instant, matching how the sheet was filled in. */
export function parisDay(at: Date): string {
  return dayFmt.format(at);
}

/** Paris-local minutes since midnight. */
function parisMinutes(at: Date): number {
  const [h, m] = timeFmt.format(at).split(":");
  return (Number(h) % 24) * 60 + Number(m);
}

/**
 * The MEP a deployment belongs to, `null` when the sheet does not cover it, or
 * "ambiguous" when the day holds MEPs that disagree and nothing to separate them.
 */
export function mepFor(meps: Mep[], environment: string, at: Date): Mep | null | "ambiguous" {
  const day = parisDay(at);
  const env = environment.toUpperCase();
  const sameDay = meps.filter((m) => m.date === day && m.environments.includes(env));
  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0];

  // Several MEPs that day. Identical scope and rollback means nothing to arbitrate.
  const distinct = new Set(sameDay.map((m) => `${m.hotfix}|${m.rolledBack}`));
  if (distinct.size === 1) return sameDay[0];

  // The hour separates them: the deployment belongs to the last window opened
  // before it, or to the earliest MEP if it ran ahead of them all.
  const timed = sameDay.filter((m) => m.startMinutes !== null);
  if (timed.length !== sameDay.length) return "ambiguous";

  const minutes = parisMinutes(at);
  const ordered = [...timed].sort((a, b) => a.startMinutes! - b.startMinutes!);
  let chosen = ordered[0];
  for (const m of ordered) if (m.startMinutes! <= minutes) chosen = m;
  return chosen;
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("result" in v) return String((v as { result: unknown }).result);
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return String(v);
};

/** Excel stores a bare time as an instant on its 1899-12-30 epoch; take the clock off it. */
function minutesOfDay(v: ExcelJS.CellValue): number | null {
  const s = cellText(v);
  const m = s.match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const truthy = (v: ExcelJS.CellValue): boolean => {
  const s = cellText(v).trim().toLowerCase();
  return s === "1" || s === "oui" || s === "true";
};

const COLUMNS = ["date", "starting_hour", "ending_hour", "environment", "scope"] as const;

/**
 * Read the sheet. Column names are checked so a reordered or renamed export fails
 * loudly instead of importing every MEP as a full release.
 */
export async function readMepTracking(path: string): Promise<Mep[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];

  const hdr: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (hdr[i] = cellText(c.value).trim().toLowerCase()));
  const missing = COLUMNS.filter((c) => !hdr.includes(c));
  if (missing.length) {
    throw new Error(
      `MEP tracking sheet: unexpected columns, missing ${missing.join(", ")}. Found: ${hdr.filter(Boolean).join(", ")}`,
    );
  }
  const col = (name: string) => hdr.indexOf(name);
  const iDate = col("date"), iStart = col("starting_hour"), iEnd = col("ending_hour");
  const iEnv = col("environment"), iScope = col("scope"), iRollback = col("rollback");

  const meps: Mep[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;

    // The date cell is a midnight instant; its UTC day is the day that was typed.
    const date = cellText(row.getCell(iDate).value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const env = cellText(row.getCell(iEnv).value).trim().toUpperCase();
    if (!env) continue;

    const scope = cellText(row.getCell(iScope).value).trim().toLowerCase();
    meps.push({
      date,
      environments: env === "BOTH" ? [...BOTH] : [env],
      hotfix: scope.includes("hotfix"),
      rolledBack: iRollback >= 0 && truthy(row.getCell(iRollback).value),
      startMinutes: minutesOfDay(row.getCell(iStart).value),
      endMinutes: minutesOfDay(row.getCell(iEnd).value),
    });
  }
  return meps;
}
