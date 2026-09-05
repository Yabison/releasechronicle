/**
 * Follow one release (a service's build/version) across environments, and check whether the
 * product's env workflow was respected. Pure: works off the events already loaded for a service.
 */

export type ReleaseStep = { eventId: string; environment: string; occurredAt: string; deployStatus: string | null };

/**
 * One workflow violation, kept structured so the UI can word it in the user's
 * language: a French sentence baked in here used to surface under an English
 * heading in the drawer.
 */
export type ReleaseIssue =
  /** Deployed to `environment` after an env that comes later in the workflow. */
  | { kind: "OUT_OF_ORDER"; environment: string }
  /** `environment` was never reached although a later workflow env was. */
  | { kind: "SKIPPED"; environment: string };

export type ReleaseTrace = {
  version: string;
  /** Earliest deployment per environment, in chronological order. */
  steps: ReleaseStep[];
  /** Product's expected env order (may be empty). */
  workflow: string[];
  /** true/false when a workflow is defined; null when none to check against. */
  respected: boolean | null;
  /** Workflow violations (skipped env, out-of-order). */
  issues: ReleaseIssue[];
  /**
   * Envs whose deployments of this build carry the violation: the env deployed
   * out of order, and every reached env past a skipped one. The rows that were
   * deployed as expected (AZER first, say) stay clean even when PROD later
   * jumped over PREPROD.
   */
  flaggedEnvs: string[];
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

  const issues: ReleaseIssue[] = [];
  const flagged = new Set<string>();
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
      if (idx < lastIdx) {
        issues.push({ kind: "OUT_OF_ORDER", environment: s.environment });
        flagged.add(s.environment);
      }
      lastIdx = Math.max(lastIdx, idx);
      furthest = Math.max(furthest, idx);
    }
    for (let i = 0; i <= furthest; i++) {
      if (byEnv.has(workflow[i])) continue;
      issues.push({ kind: "SKIPPED", environment: workflow[i] });
      for (let j = i + 1; j <= furthest; j++) if (byEnv.has(workflow[j])) flagged.add(workflow[j]);
    }
    respected = issues.length === 0;
  }

  return { version, steps, workflow, respected, issues, flaggedEnvs: [...flagged] };
}

/**
 * Workflow violations per deployment event, for the list view: every deployment
 * of a build on one of its flagged envs gets that build's issues. Events of other
 * types, versionless deployments, and clean builds are absent from the map.
 */
export function workflowIssuesByEvent(events: TraceEvent[], workflow: string[]): Map<string, ReleaseIssue[]> {
  const out = new Map<string, ReleaseIssue[]>();
  if (workflow.length === 0) return out;
  const versions = new Set<string>();
  for (const e of events) if (e.type === "DEPLOYMENT" && e.version) versions.add(e.version);
  for (const version of versions) {
    const trace = traceRelease(events, version, workflow);
    if (trace.respected !== false) continue;
    const flagged = new Set(trace.flaggedEnvs);
    for (const e of events) {
      if (e.type === "DEPLOYMENT" && e.version === version && flagged.has(e.environment)) out.set(e.id, trace.issues);
    }
  }
  return out;
}
