/**
 * Rollback detection from build numbers.
 *
 * Per service and environment, chronologically: a deployment whose build number is
 * lower than the one before it means that higher build was reverted. It is the higher
 * build that gets flagged — the lower one is the fix, not the incident.
 *
 * The signal only holds where going backwards is deliberate. On an integration
 * environment builds move in every direction all day — PR builds, feature branches,
 * a rerun of an older build to reproduce something — so the heuristic is restricted to
 * the production-facing environments. Applied everywhere it mislabels roughly one
 * AZER deployment in eight, which is worse than detecting nothing.
 *
 * It reads the TFS build number rather than the version: since the export started
 * carrying real revisions, a version is usually a tag like "2026.07.06-96550" or a
 * multi-component string, neither of which any comparison can order.
 */

/** Environments where a lower build than the previous one means a revert. */
export const ROLLBACK_ENVIRONMENTS: ReadonlySet<string> = new Set(["RUN", "SECURE", "PROD", "DEMO"]);

/** A deployment reduced to what the heuristic reasons about. */
export type BuildPoint = {
  id: string;
  serviceId: string;
  environment: string;
  at: Date;
  build: string | null;
};

function parseBuild(v: string | null): number | null {
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : null;
}

/** The ids of the deployments that look reverted. */
export function detectRollbacks(points: BuildPoint[]): Set<string> {
  const groups = new Map<string, { id: string; at: number; build: number }[]>();
  for (const p of points) {
    if (!ROLLBACK_ENVIRONMENTS.has(p.environment)) continue;
    const build = parseBuild(p.build);
    if (build === null) continue;
    const key = `${p.serviceId}|${p.environment}`;
    let list = groups.get(key);
    if (!list) { list = []; groups.set(key, list); }
    list.push({ id: p.id, at: p.at.getTime(), build });
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
