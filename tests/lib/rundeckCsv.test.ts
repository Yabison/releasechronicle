import { describe, it, expect } from "vitest";
import { parseRundeckCsv } from "../../prisma/seed/rundeck-csv";

/**
 * Fixtures here are synthetic on purpose: the real export lives under `private/`
 * and never enters the repository. What is asserted is the *mapping*, which is
 * the part that silently rots when a rundeck column is renamed.
 */
const COLUMNS = [
  "date_debut", "date_fin", "duree_min", "produit", "projet", "environnement", "job",
  "build_tfs", "version", "version_type", "branche", "rollback", "config_seule",
  "statut", "utilisateur", "execution_id", "lien",
] as const;

const HEADER = COLUMNS.join(",");

const DEFAULTS: Record<(typeof COLUMNS)[number], string> = {
  date_debut: "2026-09-04T11:11:30+00:00",
  date_fin: "2026-09-04T11:16:19+00:00",
  duree_min: "4.8",
  produit: "CheckoutRoutine",
  projet: "WD",
  environnement: "secure",
  job: "Deploy app - SECURE",
  build_tfs: "101163",
  version: "2026.09.03-101163",
  version_type: "version",
  branche: "prod-2026-09-03",
  rollback: "False",
  config_seule: "False",
  statut: "succeeded",
  utilisateur: "jane.doe",
  execution_id: "26700",
  lien: "https://rundeck.example/execution/show/26700",
};

/** One data line, overriding whichever columns the test cares about. */
const row = (over: Partial<Record<(typeof COLUMNS)[number], string>> = {}) =>
  COLUMNS.map((c) => over[c] ?? DEFAULTS[c]).join(",");

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("parseRundeckCsv", () => {
  it("maps a succeeded row onto the importer's row shape", () => {
    const [parsed] = parseRundeckCsv(csv(row()));

    expect(parsed).toEqual({
      product: "checkoutroutine",
      environment: "SECURE",
      externalId: "26700",
      occurredAt: new Date("2026-09-04T11:11:30+00:00"),
      finishedAt: new Date("2026-09-04T11:16:19+00:00"),
      version: "2026.09.03-101163",
      build: "101163",
      lot: "prod-2026-09-03",
      requester: "jane.doe",
      changeType: "NORMAL",
      deployStatus: "SUCCESS",
      externalLink: "https://rundeck.example/execution/show/26700",
      comment: "Deploy app - SECURE",
      tags: [],
    });
  });

  it("takes the version from the version column, not from the TFS build number", () => {
    const [parsed] = parseRundeckCsv(csv(row({ build_tfs: "99999", version: "1.4.2" })));

    expect(parsed.version).toBe("1.4.2");
  });

  it("keeps the TFS build number apart, since the rollback heuristic needs a number", () => {
    const [parsed] = parseRundeckCsv(csv(row({ build_tfs: "99999", version: "1.4.2" })));

    expect(parsed.build).toBe("99999");
  });

  it("keeps a multi-component version whole", () => {
    const raw = "api=2026.07.13-97053; consumer=2026.07.13-97051";
    const [parsed] = parseRundeckCsv(csv(row({ version: raw })));

    expect(parsed.version).toBe(raw);
  });

  it("maps the rundeck outcome vocabulary onto the app's", () => {
    const statuses = parseRundeckCsv(
      csv(row({ statut: "failed" }), row({ statut: "aborted" })),
    ).map((r) => r.deployStatus);

    expect(statuses).toEqual(["FAILED", "ABORTED"]);
  });

  it("turns the rollback flag into a ROLLBACK change type", () => {
    const [parsed] = parseRundeckCsv(csv(row({ rollback: "True" })));

    expect(parsed.changeType).toBe("ROLLBACK");
  });

  it("tags a config-only run so it stays distinguishable from a real deployment", () => {
    const [parsed] = parseRundeckCsv(csv(row({ config_seule: "True" })));

    expect(parsed.tags).toEqual(["config-only"]);
  });

  it("leaves version and build null when the run carries neither", () => {
    const [parsed] = parseRundeckCsv(csv(row({ build_tfs: "", version: "", version_type: "" })));

    expect(parsed.version).toBeNull();
    expect(parsed.build).toBeNull();
  });

  it("leaves finishedAt null when the run never finished", () => {
    const [parsed] = parseRundeckCsv(csv(row({ date_fin: "" })));

    expect(parsed.finishedAt).toBeNull();
  });

  it("tolerates a UTF-8 BOM and blank trailing lines", () => {
    expect(parseRundeckCsv("﻿" + csv(row()) + "\n\n")).toHaveLength(1);
  });

  it("skips a row with no product or no start date", () => {
    const rows = csv(row({ produit: "" }), row({ date_debut: "" }), row());

    expect(parseRundeckCsv(rows)).toHaveLength(1);
  });

  it("refuses a line whose field count does not match the header", () => {
    expect(() => parseRundeckCsv(csv(row() + ",extra"))).toThrow(/line 2.*18.*17/);
  });

  it("refuses an export whose columns are not the ones it knows how to map", () => {
    const renamed = HEADER.replace("version_type", "revision_type");

    expect(() => parseRundeckCsv([renamed, row()].join("\n"))).toThrow(/version_type/);
  });
});
