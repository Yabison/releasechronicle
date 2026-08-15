import { describe, it, expect } from "vitest";
import { eventToRow, rowToBody, EXCEL_COLUMNS, type ExportEvent, buildWorkbook, readWorkbook } from "@/lib/excel";

const deployEvent: ExportEvent = {
  type: "DEPLOYMENT",
  environment: "PROD",
  externalId: "dep-1",
  occurredAt: new Date("2026-07-01T10:00:00.000Z"),
  tags: ["release", "ci"],
  version: "1.2.3",
  lot: null,
  requester: "alice",
  changeType: "NORMAL",
  deployStatus: "DEPLOYED",
  externalLink: "https://x/pr/1",
  incidentType: null,
  incidentStatus: null,
  startedAt: null,
  resolvedAt: null,
  comment: null,
  windowStart: null,
  windowEnd: null,
  service: { company: "acme", product: "checkout", service: "payment-api" },
};

describe("EXCEL_COLUMNS", () => {
  it("starts with type and the envelope columns", () => {
    expect(EXCEL_COLUMNS.slice(0, 8)).toEqual([
      "type", "company", "product", "service", "environment",
      "externalId", "occurredAt", "tags",
    ]);
  });
});

describe("eventToRow", () => {
  it("flattens a deployment with slugs and joined tags", () => {
    const row = eventToRow(deployEvent);
    expect(row.type).toBe("DEPLOYMENT");
    expect(row.company).toBe("acme");
    expect(row.product).toBe("checkout");
    expect(row.service).toBe("payment-api");
    expect(row.tags).toBe("release\nci");
    expect(row.version).toBe("1.2.3");
    expect(row.occurredAt).toBeInstanceOf(Date);
    expect(row.incidentType).toBeUndefined();
  });
});

describe("rowToBody", () => {
  it("round-trips a deployment row back to a validator body", () => {
    const body = rowToBody(eventToRow(deployEvent));
    expect(body).toMatchObject({
      type: "DEPLOYMENT",
      company: "acme",
      product: "checkout",
      service: "payment-api",
      environment: "PROD",
      externalId: "dep-1",
      version: "1.2.3",
      requester: "alice",
      changeType: "NORMAL",
      deployStatus: "DEPLOYED",
      externalLink: "https://x/pr/1",
    });
    expect(body.tags).toEqual(["release", "ci"]);
    expect(typeof body.occurredAt).toBe("string");
  });

  it("accepts a Date cell and an ISO-string cell for dates", () => {
    const fromDate = rowToBody({ type: "INCIDENT", startedAt: new Date("2026-07-01T00:00:00Z") });
    const fromStr = rowToBody({ type: "INCIDENT", startedAt: "2026-07-01T00:00:00.000Z" });
    expect(fromDate.startedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(fromStr.startedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("omits blank cells", () => {
    const body = rowToBody({ type: "DEPLOYMENT", version: "1.0.0", externalLink: "" });
    expect("externalLink" in body).toBe(false);
    expect("comment" in body).toBe(false);
  });
});

describe("excel round-trip robustness", () => {
  it("parses a numeric Excel serial date cell (1900 epoch)", () => {
    // Excel serial 45658 = 2025-01-01
    const body = rowToBody({ type: "INCIDENT", startedAt: 45658 });
    expect(body.startedAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("preserves a comma inside a tag through eventToRow -> rowToBody", () => {
    const ev: ExportEvent = {
      type: "DEPLOYMENT", environment: "PROD", externalId: "d1",
      occurredAt: new Date("2026-07-01T00:00:00Z"), tags: ["needs fix, urgent", "ci"],
      version: "1.0.0", lot: null, requester: "a", changeType: "NORMAL", deployStatus: "DEPLOYED",
      externalLink: null, incidentType: null, incidentStatus: null,
      startedAt: null, resolvedAt: null, comment: null, windowStart: null, windowEnd: null,
      service: { company: "acme", product: "checkout", service: "payment-api" },
    };
    const body = rowToBody(eventToRow(ev));
    expect(body.tags).toEqual(["needs fix, urgent", "ci"]);
  });
});

describe("excel lot column", () => {
  it("includes lot in the columns and round-trips it", () => {
    expect((EXCEL_COLUMNS as readonly string[]).includes("lot")).toBe(true);
    const ev: ExportEvent = {
      type: "DEPLOYMENT", environment: "PROD", externalId: "d1",
      occurredAt: new Date("2026-07-01T00:00:00Z"), tags: [], version: "1.0.0", requester: "a",
      changeType: "NORMAL", deployStatus: "DEPLOYED", externalLink: null, incidentType: null,
      incidentStatus: null, startedAt: null, resolvedAt: null, comment: null, windowStart: null,
      windowEnd: null, lot: "rel-1", service: { company: "acme", product: "checkout", service: "payment-api" },
    };
    expect(rowToBody(eventToRow(ev)).lot).toBe("rel-1");
  });
});

describe("workbook round-trip", () => {
  it("writes rows and reads them back header-keyed", async () => {
    const rows = [
      { type: "DEPLOYMENT", company: "acme", product: "checkout", service: "payment-api",
        environment: "PROD", externalId: "dep-1", version: "1.0.0" },
      { type: "INCIDENT", company: "acme", product: "checkout", service: "payment-api",
        environment: "PROD", incidentType: "outage" },
    ];
    const buf = await buildWorkbook(rows);
    const out = await readWorkbook(buf);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("DEPLOYMENT");
    expect(out[0].version).toBe("1.0.0");
    expect(out[1].type).toBe("INCIDENT");
    expect(out[1].incidentType).toBe("outage");
    expect(out[0].incidentType).toBeUndefined();
  });

  it("produces a header-only workbook for no rows", async () => {
    const buf = await buildWorkbook([]);
    const out = await readWorkbook(buf);
    expect(out).toEqual([]);
  });
});
