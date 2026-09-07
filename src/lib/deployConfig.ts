import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * The deploy config, or an empty object when the file is missing or unreadable —
 * every getter below then falls back to its own default.
 *
 * Read per call rather than cached at import: a test (and an operator editing the
 * file) expects the next call to see the new value.
 */
function readConfig(): Record<string, unknown> {
  try {
    const file = process.env.DEPLOY_CONFIG_FILE ?? join(process.cwd(), "config", "deploy.yml");
    return (parse(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** A configured count, or `fallback` when it is absent, non-numeric or negative. */
function count(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Minutes before scheduledAt that a SCHEDULED deploy is promoted to PENDING. Default 15. */
export function scheduledLeadMinutes(): number {
  return count(readConfig().scheduledLeadMinutes, 15);
}

/** Time window (minutes) used to group deployments into the same auto lot. Default 30. */
export function autoLotWindowMinutes(): number {
  return count(readConfig().autoLotWindowMinutes, 30);
}

/** How far back a calendar feed reaches, in days. Default 90. */
export function calendarPastDays(): number {
  return count(readConfig().calendarPastDays, 90);
}

/** How far ahead a calendar feed reaches, in days. Default 365. */
export function calendarFutureDays(): number {
  return count(readConfig().calendarFutureDays, 365);
}
