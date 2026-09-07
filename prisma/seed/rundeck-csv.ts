import { slugify } from "../../src/lib/slug";

/**
 * Reader for the raw rundeck execution export.
 *
 * The xlsx the importer used to consume was already in the app's shape; this CSV
 * is rundeck's own, in French, so the vocabulary is translated here and nowhere
 * else — seed-private.ts sees the same `ImportRow` whichever file it was handed.
 *
 * The export is machine-generated and has never contained a quoted field, so a
 * split on commas is enough. It is *not* enough silently: a line whose field
 * count drifts, or a header whose columns were renamed upstream, throws rather
 * than importing shifted data that would look plausible in the UI.
 */

/** One deployment as the importer wants it, whatever file it came from. */
export type ImportRow = {
  /** Service slug — a rundeck "produit" maps 1:1 onto a service. */
  product: string;
  environment: string;
  externalId: string | null;
  occurredAt: Date;
  /** End of the rundeck run; drives the DEPLOYED transition, so lead time is real. */
  finishedAt: Date | null;
  /**
   * What was actually shipped. A TFS build number, an image tag, a semantic version,
   * or several at once for a job deploying more than one component
   * ("api=2026.07.13-97053; consumer=2026.07.13-97051") — kept whole, because two
   * rollouts differing only in their consumer are two different rollouts.
   */
  version: string | null;
  /**
   * The TFS build number alone, when there is one. Separate from `version` because
   * the rollback heuristic needs something it can compare numerically, and a version
   * is now usually a tag.
   */
  build: string | null;
  lot: string | null;
  requester: string | null;
  changeType: string | null;
  deployStatus: string | null;
  externalLink: string | null;
  comment: string | null;
  tags: string[];
};

const COLUMNS = [
  "date_debut", "date_fin", "duree_min", "produit", "projet", "environnement", "job",
  "build_tfs", "version", "version_type", "branche", "rollback", "config_seule",
  "statut", "utilisateur", "execution_id", "lien",
] as const;

/** rundeck outcome -> the vocabulary seed-private.ts's mapStatus() understands. */
const STATUS: Record<string, string> = {
  succeeded: "SUCCESS",
  failed: "FAILED",
  aborted: "ABORTED",
};

const nullable = (v: string | undefined): string | null => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

export function parseRundeckCsv(text: string): ImportRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((c) => c.trim());

  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new Error(
      `Rundeck CSV: unexpected columns, missing ${missing.join(", ")}. ` +
        `Expected the raw execution export: ${COLUMNS.join(",")}`,
    );
  }
  const at = (fields: string[], name: (typeof COLUMNS)[number]) => fields[header.indexOf(name)];

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    const f = line.split(",");
    if (f.length !== header.length) {
      throw new Error(
        `Rundeck CSV line ${i + 1}: ${f.length} fields, expected ${header.length}. ` +
          "A quoted comma would break this reader — the export has never used one.",
      );
    }

    // A run with no product or no start time carries nothing an event could hang on.
    const produit = nullable(at(f, "produit"));
    const start = nullable(at(f, "date_debut"));
    if (!produit || !start) continue;

    const end = nullable(at(f, "date_fin"));
    const statut = (nullable(at(f, "statut")) ?? "").toLowerCase();

    rows.push({
      product: slugify(produit),
      environment: (nullable(at(f, "environnement")) ?? "RUN").toUpperCase(),
      externalId: nullable(at(f, "execution_id")),
      occurredAt: new Date(start),
      finishedAt: end ? new Date(end) : null,
      // `version_type` says where the revision came from (build_tfs / image_tag /
      // version). It describes the plumbing, not the deployment, so it is not kept:
      // 101163 reads as a TFS build and 2026.07.06-96550 as an image tag anyway.
      version: nullable(at(f, "version")),
      build: nullable(at(f, "build_tfs")),
      lot: nullable(at(f, "branche")),
      requester: nullable(at(f, "utilisateur")),
      changeType: nullable(at(f, "rollback")) === "True" ? "ROLLBACK" : "NORMAL",
      deployStatus: STATUS[statut] ?? statut.toUpperCase() ?? null,
      externalLink: nullable(at(f, "lien")),
      comment: nullable(at(f, "job")),
      // A config-only run touches no artefact; keeping it visible beats dropping it.
      tags: nullable(at(f, "config_seule")) === "True" ? ["config-only"] : [],
    });
  }
  return rows;
}
