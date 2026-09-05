import type { ImportRow } from "./rundeck-csv";

/**
 * Canary rollout merge, shared by the private seeder and its tests.
 *
 * A deployment sometimes reaches production in several chained rundeck runs. Those
 * steps are one logical deployment, so they collapse into one event — otherwise the
 * frequency metric counts a rollout as five deploys.
 *
 * What a step contributes beyond its timestamp — a rollback flag, a tag — is
 * aggregated over the whole chain rather than read off the last step. The rollback
 * that prompted the rollout is rarely its final run, and dropping it loses the one
 * fact the rollout existed to record.
 */

export const CANARY_GAP_MS = 60 * 60_000;

/** A canary rollout collapsed to one logical deployment. */
export type Merged = {
  /** Start of the first step. */
  first: Date;
  /** Last step: status, link, requester and end time come from it. */
  last: ImportRow;
  steps: number;
  /** True when ANY step was flagged a rollback. */
  rollback: boolean;
  /** Union of the tags of every step, order of first appearance. */
  tags: string[];
};

function collapse(chain: ImportRow[]): Merged {
  const tags: string[] = [];
  for (const r of chain) {
    for (const t of r.tags) if (!tags.includes(t)) tags.push(t);
  }
  return {
    first: chain[0].occurredAt,
    last: chain[chain.length - 1],
    steps: chain.length,
    rollback: chain.some((r) => r.changeType === "ROLLBACK"),
    tags,
  };
}

/**
 * Collapse chained canary steps. Rows are grouped by service+env+version, sorted by time;
 * consecutive steps within CANARY_GAP_MS join the same rollout, a larger gap starts a new one.
 */
export function mergeCanary(rows: ImportRow[]): Merged[] {
  const key = (r: ImportRow) => `${r.product}|${r.environment}|${r.version ?? ""}`;
  const sorted = [...rows].sort((a, b) =>
    a.product.localeCompare(b.product) ||
    a.environment.localeCompare(b.environment) ||
    (a.version ?? "").localeCompare(b.version ?? "") ||
    a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  const out: Merged[] = [];
  let chain: ImportRow[] = [];
  const flush = () => { if (chain.length) out.push(collapse(chain)); };
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
