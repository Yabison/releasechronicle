import ExcelJS from "exceljs";

export const EXCEL_COLUMNS = [
  "type", "company", "product", "service", "environment",
  "externalId", "occurredAt", "tags",
  "version", "lot", "requester", "changeType", "deployStatus", "externalLink",
  "incidentType", "incidentStatus", "startedAt", "resolvedAt", "comment",
  "windowStart", "windowEnd",
] as const;

export type ExcelColumn = (typeof EXCEL_COLUMNS)[number];

const DATE_COLUMNS = ["occurredAt", "startedAt", "resolvedAt", "windowStart", "windowEnd"] as const;
const DATE_SET = new Set<string>(DATE_COLUMNS);

// Newline separates tags in a cell: it round-trips losslessly (unlike "," or ";",
// which can legitimately appear inside a tag).
const TAG_SEP = "\n";

/** An event with its hierarchy resolved to slugs — the shape export queries return. */
export type ExportEvent = {
  type: "DEPLOYMENT" | "INCIDENT" | "MAINTENANCE";
  environment: string;
  externalId: string | null;
  occurredAt: Date;
  tags: string[];
  version: string | null;
  lot: string | null;
  requester: string | null;
  changeType: string | null;
  deployStatus: string | null;
  externalLink: string | null;
  incidentType: string | null;
  incidentStatus: string | null;
  startedAt: Date | null;
  resolvedAt: Date | null;
  comment: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  service: { company: string; product: string; service: string };
};

/** Cell values a workbook row can hold. */
export type ExcelRow = Partial<Record<ExcelColumn, string | number | Date | undefined>>;

/** Flatten a resolved event into a header-keyed row. Empty/null values are omitted. */
export function eventToRow(e: ExportEvent): ExcelRow {
  const row: ExcelRow = {
    type: e.type,
    company: e.service.company,
    product: e.service.product,
    service: e.service.service,
    environment: e.environment,
    occurredAt: e.occurredAt,
  };
  if (e.externalId) row.externalId = e.externalId;
  if (e.tags.length) row.tags = e.tags.join(TAG_SEP);

  const optional: [ExcelColumn, string | Date | null][] = [
    ["version", e.version], ["lot", e.lot], ["requester", e.requester], ["changeType", e.changeType],
    ["deployStatus", e.deployStatus], ["externalLink", e.externalLink],
    ["incidentType", e.incidentType], ["incidentStatus", e.incidentStatus],
    ["startedAt", e.startedAt], ["resolvedAt", e.resolvedAt], ["comment", e.comment],
    ["windowStart", e.windowStart], ["windowEnd", e.windowEnd],
  ];
  for (const [k, v] of optional) {
    if (v !== null && v !== undefined && v !== "") row[k] = v;
  }
  return row;
}

function cellToDateString(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString();
  }
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
}

function cellToString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = typeof v === "string" ? v.trim() : String(v);
  return s === "" ? undefined : s;
}

/**
 * Normalize a workbook row into the plain object the per-type validators accept.
 * Does not validate. Date cells become ISO strings; `tags` splits to string[].
 * Blank cells are omitted so validators treat them as absent.
 */
export function rowToBody(row: ExcelRow): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const col of EXCEL_COLUMNS) {
    const raw = row[col];
    if (raw === null || raw === undefined || raw === "") continue;
    if (col === "tags") {
      body.tags = String(raw).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    } else if (DATE_SET.has(col)) {
      const d = cellToDateString(raw);
      if (d !== undefined) body[col] = d;
    } else {
      const s = cellToString(raw);
      if (s !== undefined) body[col] = s;
    }
  }
  return body;
}

const SHEET_NAME = "Events";

/** Build an .xlsx workbook (header + one row per record) and return its bytes. */
export async function buildWorkbook(rows: ExcelRow[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);
  ws.columns = EXCEL_COLUMNS.map((key) => ({ header: key, key }));
  for (const row of rows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** Read the first worksheet into header-keyed rows. Unknown columns are ignored. */
export async function readWorkbook(data: Uint8Array): Promise<ExcelRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "").trim();
  });

  const rows: ExcelRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const excelRow = ws.getRow(r);
    const record: ExcelRow = {};
    let hasValue = false;
    excelRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (!key || !(EXCEL_COLUMNS as readonly string[]).includes(key)) return;
      const v = cell.value;
      if (v === null || v === undefined || v === "") return;
      record[key as ExcelColumn] = v instanceof Date ? v : (v as string | number);
      hasValue = true;
    });
    if (hasValue) rows.push(record);
  }
  return rows;
}
