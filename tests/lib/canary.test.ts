import { describe, it, expect } from "vitest";
import { mergeCanary, CANARY_GAP_MS } from "../../prisma/seed/canary";
import type { ImportRow } from "../../prisma/seed/rundeck-csv";

const T0 = new Date("2026-01-29T12:00:00Z").getTime();

/** A minimal deploy row; only the fields the merge reasons about are interesting. */
const row = (minutes: number, over: Partial<ImportRow> = {}): ImportRow => ({
  product: "checkout",
  environment: "RUN",
  externalId: String(minutes),
  occurredAt: new Date(T0 + minutes * 60_000),
  finishedAt: null,
  version: "82708",
  build: "82708",
  lot: null,
  requester: "someone",
  changeType: "NORMAL",
  deployStatus: "SUCCESS",
  externalLink: null,
  comment: null,
  tags: [],
  ...over,
});

describe("mergeCanary", () => {
  it("collapses chained steps into one rollout, keeping first start and last step", () => {
    const [rollout, ...rest] = mergeCanary([row(0), row(45), row(70)]);

    expect(rest).toEqual([]);
    expect(rollout.steps).toBe(3);
    expect(rollout.first).toEqual(new Date(T0));
    expect(rollout.last.externalId).toBe("70");
  });

  it("starts a new rollout once the gap is exceeded", () => {
    const gapMin = CANARY_GAP_MS / 60_000;

    expect(mergeCanary([row(0), row(gapMin + 1)])).toHaveLength(2);
  });

  it("keeps rollouts of different versions apart", () => {
    const merged = mergeCanary([row(0), row(5, { version: "82709" })]);

    expect(merged).toHaveLength(2);
  });

  it("marks the rollout as a rollback when any step is one, not just the last", () => {
    const merged = mergeCanary([row(0), row(10, { changeType: "ROLLBACK" }), row(20)]);

    expect(merged).toHaveLength(1);
    expect(merged[0].rollback).toBe(true);
  });

  it("carries the tags of every step, not only the last", () => {
    const merged = mergeCanary([row(0, { tags: ["config-only"] }), row(10, { tags: ["config-only"] }), row(20)]);

    expect(merged[0].tags).toEqual(["config-only"]);
  });

  it("reports no rollback when no step is one", () => {
    expect(mergeCanary([row(0), row(10)])[0].rollback).toBe(false);
  });
});
