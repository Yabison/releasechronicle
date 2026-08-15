/**
 * Follow one release (a service's build/version) across environments, and check whether the
 * product's env workflow was respected. Pure: works off the events already loaded for a service.
 */

export type ReleaseStep = { eventId: string; environment: string; occurredAt: string; deployStatus: string | null };

export type ReleaseTrace = {
  version: string;
  /** Earliest deployment per environment, in chronological order. */
  steps: ReleaseStep[];
  /** Product's expected env order (may be empty). */
  workflow: string[];
  /** true/false when a workflow is defined; null when none to check against. */
  respected: boolean | null;
  /** Human-readable workflow violations (skipped env, out-of-order). */
  issues: string[];
};

type TraceEvent = {
  id: string;
  type: string;
  version: string | null;
  environment: string;
  occurredAt: string;
  deployStatus: string | null;
};

export function traceRelease(events: TraceEvent[], version: string, workflow: string[]): ReleaseTrace {
  const deploys = events.filter((e) => e.type === "DEPLOYMENT" && e.version === version);

  // Earliest deployment per environment.
  const byEnv = new Map<string, ReleaseStep>();
  for (const e of deploys) {
    const cur = byEnv.get(e.environment);
    if (!cur || e.occurredAt < cur.occurredAt) {
      byEnv.set(e.environment, { eventId: e.id, environment: e.environment, occurredAt: e.occurredAt, deployStatus: e.deployStatus });
    }
  }
  const steps = [...byEnv.values()].sort((a, b) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0,
  );

  const issues: string[] = [];
  let respected: boolean | null = null;
  if (workflow.length > 0) {
    // Walk the reached workflow envs in chronological order; the workflow index must never
    // go backwards (out-of-order), and no earlier workflow env may be skipped before the
    // furthest one reached.
    let lastIdx = -1;
    let furthest = -1;
    for (const s of steps) {
      const idx = workflow.indexOf(s.environment);
      if (idx === -1) continue; // env outside the workflow — not a violation on its own
      if (idx < lastIdx) issues.push(`${s.environment} déployé hors ordre`);
      lastIdx = Math.max(lastIdx, idx);
      furthest = Math.max(furthest, idx);
    }
    for (let i = 0; i <= furthest; i++) {
      if (!byEnv.has(workflow[i])) issues.push(`${workflow[i]} sauté`);
    }
    respected = issues.length === 0;
  }

  return { version, steps, workflow, respected, issues };
}
